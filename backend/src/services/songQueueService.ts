import { RecommendationState, Song, SongWithInstance } from '../types/song';
import { HeartModeError, HeartModeSession } from './netease/recommendation.service';

export interface QueueDependencies {
  getPlayInfo: (id: string) => Promise<{ url: string; time: number }>;
  createHeartSession: (initialSongId?: number) => Pick<HeartModeSession, 'nextSongs'>;
  emit: (event: { type: string; payload: unknown }) => void;
}

export class SongQueueService {
  constructor(private readonly dependencies: QueueDependencies) {}
  private disposed = false;
  private playbackRevision = 0;
  private queue: SongWithInstance[] = [];
  private currentInstanceId = 0;
  private currentSong: { song: SongWithInstance; url: string; startTime: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = false;
  private loadingSong: SongWithInstance | null = null;
  private generation = 0;
  private recommendedQueue: SongWithInstance[] = [];
  private recommendationsEnabled = false;
  private recommendationPhase: 'heart' | null = null;
  private recommendationLoading = false;
  private recommendationError: string | null = null;
  private recommendationGeneration = 0;
  private refillTask: Promise<void> | null = null;
  private refillRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private recentSongIds: number[] = [];
  private excludedRecommendationIds: number[] = [];
  private heartModeSession: Pick<HeartModeSession, 'nextSongs'> | null = null;

  getCurrentSong() { return this.currentSong; }
  getPlayback() { return { song: this.currentSong?.song || null, url: this.currentSong?.url || '', startTime: this.currentSong?.startTime || 0, playbackRevision: this.playbackRevision }; }
  getQueue() { return [...this.queue, ...this.recommendedQueue]; }
  peek() { return this.queue[0] || this.recommendedQueue[0]; }
  getRecommendationState(): RecommendationState {
    return { enabled: this.recommendationsEnabled, loading: this.recommendationLoading, phase: this.recommendationPhase, queued: this.recommendedQueue.length, error: this.recommendationError };
  }

  enqueue(song: Song) {
    if (this.disposed) throw new Error('房间已结束');
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
    if (removedRecommendation) this.excludeRecommendation(removedRecommendation.id);
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

  async startHeartMode(): Promise<RecommendationState> {
    if (this.disposed) return this.getRecommendationState();
    if (!this.recommendationsEnabled) {
      ++this.recommendationGeneration;
      this.recommendationsEnabled = true;
      this.recommendationPhase = 'heart';
      this.recommendationError = null;
      this.heartModeSession = this.dependencies.createHeartSession(this.currentSong?.song.id);
      this.broadcastRecommendationState();
    }
    await this.refillRecommendations();
    return this.getRecommendationState();
  }

  stopRecommendations() {
    ++this.recommendationGeneration;
    this.recommendationsEnabled = false;
    this.recommendationLoading = false;
    this.recommendationPhase = null;
    this.recommendationError = null;
    this.recommendedQueue = [];
    this.heartModeSession = null;
    this.refillTask = null;
    if (this.refillRetryTimer) clearTimeout(this.refillRetryTimer);
    this.refillRetryTimer = null;
    this.broadcastQueue();
    // Stopping refill keeps the current track and the manual queue intact.
    void this.startNextSongIfIdle();
    return this.getRecommendationState();
  }

  private filterFreshSongs(songs: Song[], allowRecent = false) {
    const seen = new Set([
      ...(allowRecent ? this.recentSongIds.slice(-1) : this.recentSongIds),
      ...this.excludedRecommendationIds,
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
    this.recentSongIds = this.recentSongIds.filter(songId => songId !== id);
    this.recentSongIds.push(id);
    if (this.recentSongIds.length > 100) this.recentSongIds.shift();
  }

  private excludeRecommendation(id: number) {
    this.excludedRecommendationIds = this.excludedRecommendationIds.filter(songId => songId !== id);
    this.excludedRecommendationIds.push(id);
    if (this.excludedRecommendationIds.length > 100) this.excludedRecommendationIds.shift();
  }

  private refillRecommendations(): Promise<void> {
    const session = this.heartModeSession;
    if (!this.recommendationsEnabled || !session || this.refillRetryTimer || this.recommendedQueue.length > 2) return Promise.resolve();
    if (this.refillTask) return this.refillTask;
    const generation = this.recommendationGeneration;
    this.recommendationLoading = true;
    this.recommendationPhase = 'heart';
    this.recommendationError = null;
    this.broadcastRecommendationState();
    this.refillTask = this.loadHeartMode(generation, session);
    return this.refillTask;
  }

  private async loadHeartMode(generation: number, session: Pick<HeartModeSession, 'nextSongs'>) {
    const candidates: Song[] = [];
    let added = 0;
    try {
      // Bounded batches avoid spinning when heart mode returns duplicates or no songs.
      for (let attempt = 0; attempt < 3 && this.recommendedQueue.length < 3; ++attempt) {
        const songs = await session.nextSongs();
        if (generation !== this.recommendationGeneration) return;
        candidates.push(...songs);
        const fresh = this.filterFreshSongs(songs);
        const additions = fresh.slice(0, 3 - this.recommendedQueue.length);
        added += additions.length;
        this.recommendedQueue.push(...additions.map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'heart' as const })));
        if (additions.length) {
          this.broadcastQueue();
          // Play the first available song while the remaining batches continue.
          void this.startNextSongIfIdle();
        }
      }
      if (!added && !this.recommendedQueue.length) {
        // A repeated upstream batch must not be rejected forever by playback history.
        // Keep current, queued, skipped and unavailable songs excluded, as well as the last played song.
        const fallback = this.filterFreshSongs(candidates, true)
          .sort((a, b) => this.recentSongIds.indexOf(a.id) - this.recentSongIds.indexOf(b.id)).slice(0, 3);
        this.recommendedQueue.push(...fallback.map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'heart' as const })));
        added += fallback.length;
      }
      if (!added && !this.recommendedQueue.length) {
        this.recommendationError = '暂时没有可播放的心动推荐，30 秒后自动重试';
        console.warn('Heart mode returned no eligible songs; retrying in 30 seconds.', { received: candidates.length });
      }
    } catch (error) {
      if (generation === this.recommendationGeneration) {
        const problem = error instanceof HeartModeError ? error : new HeartModeError('心动模式暂不可用', true);
        this.recommendationError = problem.message + (problem.retryable ? '，30 秒后自动重试' : '');
        if (!problem.retryable) {
          this.recommendationsEnabled = false;
          this.recommendationPhase = null;
          this.recommendedQueue = [];
          this.heartModeSession = null;
        }
        console.warn(problem.retryable ? 'Heart mode request failed; retrying in 30 seconds.' : 'Heart mode requires a logged-in account and a non-empty liked playlist.');
      }
    } finally {
      if (generation === this.recommendationGeneration) {
        this.recommendationLoading = false;
        this.refillTask = null;
        if (this.recommendationsEnabled && this.recommendationError) {
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
    if (this.disposed || this.currentSong || this.loading) return;
    if (!this.peek()) { void this.refillRecommendations(); return; }
    this.loading = true;
    const generation = this.generation;
    const recommendationGeneration = this.recommendationGeneration;
    const nextSong = this.dequeue()!;
    this.loadingSong = nextSong;
    this.broadcastQueue();
    void this.refillRecommendations();
    try {
      const playInfo = await this.dependencies.getPlayInfo(String(nextSong.id));
      if (generation !== this.generation) return;
      if (nextSong.source !== 'manual' && (!this.recommendationsEnabled || recommendationGeneration !== this.recommendationGeneration || this.queue.length)) {
        if (this.recommendationsEnabled && recommendationGeneration === this.recommendationGeneration) this.recommendedQueue.unshift(nextSong);
        this.broadcastQueue();
        return;
      }
      if (!playInfo?.url) throw new Error('No playable URL');
      const duration = playInfo.time > 0 ? Math.min(nextSong.duration || playInfo.time, playInfo.time) : nextSong.duration;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid song duration');
      const song = { ...nextSong, duration };
      const startTime = Date.now();
      this.currentSong = { song, url: playInfo.url, startTime };
      ++this.playbackRevision;
      this.rememberSong(song.id);
      this.emit({ type: 'PLAY_SONG', payload: this.getPlayback() });
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
        if (nextSong.source === 'heart') this.excludeRecommendation(nextSong.id);
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

  skipToNext(expectedRevision = this.playbackRevision) {
    if (this.disposed || expectedRevision !== this.playbackRevision) return;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loading = false;
    if (this.currentSong?.song.source === 'heart') this.excludeRecommendation(this.currentSong.song.id);
    if (this.loadingSong?.source === 'heart') this.excludeRecommendation(this.loadingSong.id);
    this.loadingSong = null;
    this.finishCurrentSong();
    void this.startNextSongIfIdle();
  }

  private finishCurrentSong() {
    this.currentSong = null;
    ++this.playbackRevision;
    this.emit({ type: 'PLAY_SONG', payload: this.getPlayback() });
  }
  private broadcastQueue() {
    this.emit({ type: 'QUEUE_UPDATED', payload: this.getQueue() });
    this.broadcastRecommendationState();
  }
  private broadcastRecommendationState() { this.emit({ type: 'RECOMMENDATIONS_UPDATED', payload: this.getRecommendationState() }); }
  private emit(event: { type: string; payload: unknown }) { if (!this.disposed) this.dependencies.emit(event); }
  resetAuthorization() {
    if (this.disposed) return;
    if (!this.currentSong) {
      ++this.generation;
      if (this.loadingSong?.source === 'manual') this.queue.unshift(this.loadingSong);
      this.loadingSong = null; this.loading = false;
    }
    this.excludedRecommendationIds = [];
    this.stopRecommendations();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation; ++this.recommendationGeneration;
    if (this.timer) clearTimeout(this.timer);
    if (this.refillRetryTimer) clearTimeout(this.refillRetryTimer);
    this.timer = null; this.refillRetryTimer = null;
    this.queue = []; this.recommendedQueue = []; this.currentSong = null;
    this.heartModeSession = null; this.refillTask = null; this.loadingSong = null;
    this.loading = false; this.recommendationsEnabled = false; this.recommendationLoading = false;
  }
}
