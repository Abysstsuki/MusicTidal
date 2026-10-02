import { RecommendationState, Song, SongWithInstance } from '../types/song';
import { broadcast, setCurrentSongInfo } from './websocketServer';
import { getSongPlayInfo } from './netease/song.service';
import { getDailyRecommendedSongs, getPersonalFmSongs } from './netease/recommendation.service';

class SongQueueService {
  private queue: SongWithInstance[] = [];
  private currentInstanceId = 0;
  private currentSong: { song: Song; startTime: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = false;
  private loadingSong: SongWithInstance | null = null;
  private generation = 0;
  private recommendedQueue: SongWithInstance[] = [];
  private recommendationsEnabled = false;
  private recommendationPhase: 'daily' | 'fm' | null = null;
  private recommendationLoading = false;
  private recommendationError: string | null = null;
  private recommendationGeneration = 0;
  private dailyTask: Promise<RecommendationState> | null = null;
  private refillTask: Promise<void> | null = null;
  private refillRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private recentSongIds: number[] = [];

  getCurrentSong() { return this.currentSong; }
  getQueue() { return [...this.queue, ...this.recommendedQueue]; }
  peek() { return this.queue[0] || this.recommendedQueue[0]; }
  getRecommendationState(): RecommendationState {
    return { enabled: this.recommendationsEnabled, loading: this.recommendationLoading, phase: this.recommendationPhase, queued: this.recommendedQueue.length, error: this.recommendationError };
  }

  enqueue(song: Song) {
    const added: SongWithInstance = { ...song, instanceId: ++this.currentInstanceId, source: 'manual' };
    this.queue.push(added);
    this.broadcastQueue();
    void this.startNextSongIfIdle();
    return added;
  }

  dequeue() { return this.queue.shift() || this.recommendedQueue.shift(); }
  clear() { this.queue = []; this.stopRecommendations(); }
  removeById(instanceId: number) {
    const removedRecommendation = this.recommendedQueue.find(song => song.instanceId === instanceId);
    if (removedRecommendation) this.rememberSong(removedRecommendation.id);
    this.queue = this.queue.filter(song => song.instanceId !== instanceId);
    this.recommendedQueue = this.recommendedQueue.filter(song => song.instanceId !== instanceId);
    this.broadcastQueue();
    void this.refillRecommendations();
  }
  moveToTop(instanceId: number) {
    const index = this.queue.findIndex(song => song.instanceId === instanceId);
    if (index !== -1) {
      const [song] = this.queue.splice(index, 1);
      this.queue.unshift(song);
      this.broadcastQueue();
    } else {
      const recommendedIndex = this.recommendedQueue.findIndex(song => song.instanceId === instanceId);
      if (recommendedIndex !== -1) {
        const [song] = this.recommendedQueue.splice(recommendedIndex, 1);
        this.queue.unshift({ ...song, source: 'manual' });
        this.broadcastQueue();
        void this.refillRecommendations();
      }
    }
  }

  startDailyRecommendations(): Promise<RecommendationState> {
    if (this.dailyTask) return this.dailyTask;
    if (this.recommendationsEnabled) return Promise.resolve(this.getRecommendationState());
    const generation = ++this.recommendationGeneration;
    this.recommendationsEnabled = true;
    this.recommendationLoading = true;
    this.recommendationPhase = 'daily';
    this.recommendationError = null;
    this.broadcastRecommendationState();
    this.dailyTask = this.loadDailyRecommendations(generation);
    return this.dailyTask;
  }

  stopRecommendations() {
    ++this.recommendationGeneration;
    this.recommendationsEnabled = false;
    this.recommendationLoading = false;
    this.recommendationPhase = null;
    this.recommendationError = null;
    this.recommendedQueue = [];
    this.dailyTask = null;
    this.refillTask = null;
    if (this.refillRetryTimer) clearTimeout(this.refillRetryTimer);
    this.refillRetryTimer = null;
    this.broadcastQueue();
    // Stopping refill keeps the current track and the manual queue intact.
    void this.startNextSongIfIdle();
    return this.getRecommendationState();
  }

  private async loadDailyRecommendations(generation: number): Promise<RecommendationState> {
    try {
      const songs = await getDailyRecommendedSongs();
      if (generation !== this.recommendationGeneration) return this.getRecommendationState();
      const fresh = this.filterFreshSongs(songs);
      if (!fresh.length) throw new Error('今天的日推暂时没有新的歌曲，请稍后再试');
      this.recommendedQueue = fresh.map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'daily' }));
      this.broadcastQueue();
    } catch (error) {
      if (generation !== this.recommendationGeneration) return this.getRecommendationState();
      this.recommendationsEnabled = false;
      this.recommendationPhase = null;
      this.recommendationError = (error as Error).message;
      throw error;
    } finally {
      if (generation === this.recommendationGeneration) {
        this.recommendationLoading = false;
        this.dailyTask = null;
        this.broadcastRecommendationState();
      }
    }
    void this.startNextSongIfIdle();
    void this.refillRecommendations();
    return this.getRecommendationState();
  }

  private filterFreshSongs(songs: Song[]) {
    const seen = new Set([
      ...this.recentSongIds,
      ...this.getQueue().map(song => song.id),
      ...(this.currentSong ? [this.currentSong.song.id] : []),
      ...(this.loadingSong ? [this.loadingSong.id] : []),
    ]);
    return songs.filter(song => {
      if (seen.has(song.id)) return false;
      seen.add(song.id);
      return true;
    });
  }

  private rememberSong(id: number) {
    this.recentSongIds.push(id);
    if (this.recentSongIds.length > 100) this.recentSongIds.shift();
  }

  private refillRecommendations(): Promise<void> {
    if (!this.recommendationsEnabled || this.dailyTask || this.refillRetryTimer || this.recommendedQueue.length > 2) return Promise.resolve();
    if (this.refillTask) return this.refillTask;
    const generation = this.recommendationGeneration;
    this.recommendationLoading = true;
    this.recommendationPhase = 'fm';
    this.recommendationError = null;
    this.broadcastRecommendationState();
    this.refillTask = this.loadPersonalFm(generation);
    return this.refillTask;
  }

  private async loadPersonalFm(generation: number) {
    try {
      // Bounded requests avoid spinning when FM returns duplicates or no songs.
      for (let attempt = 0; attempt < 3 && this.recommendedQueue.length < 3; ++attempt) {
        const songs = await getPersonalFmSongs();
        if (generation !== this.recommendationGeneration) return;
        const fresh = this.filterFreshSongs(songs);
        this.recommendedQueue.push(...fresh.slice(0, 3 - this.recommendedQueue.length).map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'fm' as const })));
      }
      if (this.recommendedQueue.length < 3) this.recommendationError = '暂时没有新的 FM 歌曲，稍后会自动重试';
    } catch {
      if (generation === this.recommendationGeneration) this.recommendationError = '私人 FM 暂不可用，稍后会自动重试';
    } finally {
      if (generation === this.recommendationGeneration) {
        this.recommendationLoading = false;
        this.refillTask = null;
        if (this.recommendationError) {
          this.refillRetryTimer = setTimeout(() => {
            this.refillRetryTimer = null;
            if (generation === this.recommendationGeneration) void this.refillRecommendations();
          }, 30000);
          this.refillRetryTimer.unref?.();
        }
        this.broadcastQueue();
        void this.startNextSongIfIdle();
      }
    }
  }

  async startNextSongIfIdle() {
    if (this.currentSong || this.loading) return;
    if (!this.peek()) { void this.refillRecommendations(); return; }
    this.loading = true;
    const generation = this.generation;
    const recommendationGeneration = this.recommendationGeneration;
    const nextSong = this.dequeue()!;
    this.loadingSong = nextSong;
    this.broadcastQueue();
    void this.refillRecommendations();
    try {
      const playInfo = await getSongPlayInfo(String(nextSong.id));
      if (generation !== this.generation) return;
      if (nextSong.source !== 'manual' && (!this.recommendationsEnabled || recommendationGeneration !== this.recommendationGeneration || this.queue.length)) {
        if (this.recommendationsEnabled && recommendationGeneration === this.recommendationGeneration) this.recommendedQueue.unshift(nextSong);
        this.broadcastQueue();
        return;
      }
      if (!playInfo?.url) throw new Error('No playable URL');
      const duration = nextSong.duration > 0 ? nextSong.duration : playInfo.time;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid song duration');
      const song = { ...nextSong, duration };
      const startTime = Date.now();
      this.currentSong = { song, startTime };
      this.rememberSong(song.id);
      setCurrentSongInfo(song, playInfo.url, startTime);
      broadcast({ type: 'PLAY_SONG', payload: { song, url: playInfo.url, startTime } });
      // Song duration is milliseconds. Only the server advances shared playback.
      this.timer = setTimeout(() => {
        if (generation !== this.generation) return;
        this.timer = null;
        this.finishCurrentSong();
        void this.startNextSongIfIdle();
      }, duration);
    } catch {
      if (generation === this.generation) {
        this.rememberSong(nextSong.id);
        console.warn('Skipping unavailable track:', nextSong.id);
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.loadingSong = null;
        if (!this.currentSong) void this.startNextSongIfIdle();
      }
    }
  }

  skipToNext() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loading = false;
    if (this.loadingSong) this.rememberSong(this.loadingSong.id);
    this.loadingSong = null;
    this.finishCurrentSong();
    void this.startNextSongIfIdle();
  }

  private finishCurrentSong() {
    this.currentSong = null;
    setCurrentSongInfo(null, '', 0);
    broadcast({ type: 'PLAY_SONG', payload: { song: null, url: '', startTime: 0 } });
  }
  private broadcastQueue() {
    broadcast({ type: 'QUEUE_UPDATED', payload: this.getQueue() });
    this.broadcastRecommendationState();
  }
  private broadcastRecommendationState() { broadcast({ type: 'RECOMMENDATIONS_UPDATED', payload: this.getRecommendationState() }); }
}

export const songQueueService = new SongQueueService();
