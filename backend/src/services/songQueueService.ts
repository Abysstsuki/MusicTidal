import { RecommendationState, Song, SongWithInstance, MusicProvider, PlayInfo, songKey } from '../types/song';
import { HeartModeError, HeartModeSession } from './netease/recommendation.service';
import { PlaylistQueue, type PlaylistCandidate } from './playlistQueue';
import type { PlaybackMode, PlaylistIndex, PlaylistOrder, PlaylistState } from '../types/playlist';
import { HttpError } from '../utils/httpError';

export interface QueueDependencies {
  getPlayInfo: (id: string, song?: Song) => Promise<PlayInfo>;
  createHeartSession: (initialSongId?: number) => Pick<HeartModeSession, 'nextSongs'>;
  emit: (event: { type: string; payload: unknown }) => void;
  getPlaylistSong?: (candidate: PlaylistCandidate) => Promise<Song | undefined>;
  canPlaySong?: (song: Pick<Song, 'provider'>) => boolean;
  createRecommendationSession?: (provider: MusicProvider, initialSongId?: number) => { nextSongs(): Promise<Song[]> };
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
  private mode: PlaybackMode = 'regular';
  readonly playlists = new PlaylistQueue();
  private recommendedQueue: SongWithInstance[] = [];
  private recommendationsEnabled = false;
  private recommendationPhase: 'heart' | 'roam' | null = null;
  private recommendationProvider: MusicProvider | null = null;
  private recommendationLoading = false;
  private recommendationError: string | null = null;
  private recommendationGeneration = 0;
  private refillTask: Promise<void> | null = null;
  private refillRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private recentSongIds: string[] = [];
  private excludedRecommendationIds: string[] = [];
  private heartModeSession: Pick<HeartModeSession, 'nextSongs'> | null = null;

  getCurrentSong() { return this.currentSong; }
  getPlayback() { return { song: this.currentSong?.song || null, url: this.currentSong?.url || '', startTime: this.currentSong?.startTime || 0, playbackRevision: this.playbackRevision }; }
  private available(song: Pick<Song, 'provider'>) { return this.dependencies.canPlaySong?.(song) ?? true; }
  getQueue() { return [...this.queue, ...this.recommendedQueue].map(song => ({ ...song,
    unavailableReason: this.available(song) ? null : `房主尚未有效绑定${song.provider === 'qqmusic' ? ' QQ 音乐' : '网易云'}` })); }
  peek() { return this.queue.find(song => this.available(song)) || this.recommendedQueue.find(song => this.available(song)); }
  getRecommendationState(): RecommendationState {
    return { enabled: this.recommendationsEnabled, loading: this.recommendationLoading, phase: this.recommendationPhase, provider: this.recommendationProvider, queued: this.recommendedQueue.length, error: this.recommendationError, paused: this.mode === 'playlist' };
  }
  getPlaylistState(): PlaylistState {
    return { mode: this.mode, activeEntryId: this.playlists.activeEntryId, entries: this.playlists.snapshots(), loading: this.mode === 'playlist' && this.loading };
  }
  addPlaylist(index: PlaylistIndex, addedBy: { id: number; username: string }) {
    this.assertAlive(); const entryId = this.playlists.add(index, addedBy); this.broadcastPlaylists(); return entryId;
  }
  activatePlaylist(entryId: string) {
    this.assertAlive(); this.playlists.activate(entryId); this.changeMode('playlist');
  }
  setMode(mode: PlaybackMode) {
    this.assertAlive();
    if (mode === 'playlist' && !this.playlists.activeEntryId) throw new HttpError(409, '请先选择一张歌单', 'PLAYLIST_NOT_ACTIVE');
    if (mode === this.mode) return;
    this.changeMode(mode);
  }
  setPlaylistSettings(entryId: string, order: PlaylistOrder | undefined, repeat: boolean | undefined) {
    this.assertAlive(); this.playlists.settings(entryId, order, repeat);
    if (this.mode === 'playlist' && entryId === this.playlists.activeEntryId) this.cancelPendingSelection();
    this.broadcastPlaylists(); void this.startNextSongIfIdle();
  }
  nominatePlaylistSong(entryId: string, songId: number) {
    this.assertAlive(); this.playlists.nominate(entryId, songId);
    if (this.mode === 'playlist') this.cancelPendingSelection();
    this.broadcastPlaylists(); void this.startNextSongIfIdle();
  }
  removePlaylist(entryId: string) {
    this.assertAlive();
    if (entryId === this.playlists.activeEntryId && this.mode === 'playlist') this.cancelPendingSelection();
    this.playlists.remove(entryId); this.broadcastPlaylists();
  }
  invalidatePlaylistSource(userId: number, provider: MusicProvider = 'netease') {
    if (this.disposed) return;
    if (this.playlists.invalidateSource(userId, provider) && this.mode === 'playlist') this.cancelPendingSelection();
    this.broadcastPlaylists();
  }
  private assertAlive() { if (this.disposed) throw new HttpError(404, '房间已结束', 'ROOM_CLOSED'); }
  private changeMode(mode: PlaybackMode) {
    this.cancelPendingSelection(); this.mode = mode;
    if (mode === 'playlist') {
      ++this.recommendationGeneration; this.refillTask = null; this.recommendationLoading = false;
      if (this.refillRetryTimer) clearTimeout(this.refillRetryTimer);
      this.refillRetryTimer = null;
    }
    this.broadcastQueue(); this.broadcastPlaylists(); void this.startNextSongIfIdle();
    if (mode === 'regular') void this.refillRecommendations();
  }
  private cancelPendingSelection() {
    ++this.generation;
    if (this.loadingSong?.source === 'manual') this.queue.unshift(this.loadingSong);
    else if (this.loadingSong?.source === 'heart' && this.recommendationsEnabled) this.recommendedQueue.unshift(this.loadingSong);
    this.loadingSong = null; this.loading = false;
  }
  private broadcastPlaylists() { this.emit({ type: 'PLAYLIST_STATE_UPDATED', payload: this.getPlaylistState() }); }

  enqueue(song: Song) {
    return this.enqueueMany([song])[0];
  }

  enqueueMany(songs: Song[]): SongWithInstance[] {
    this.assertAlive();
    if (!songs.length) return [];
    const added = songs.map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'manual' as const }));
    this.queue.push(...added);
    this.broadcastQueue();
    void this.startNextSongIfIdle();
    return added;
  }

  dequeue() {
    for (const queue of [this.queue, this.recommendedQueue]) {
      const index = queue.findIndex(song => this.available(song));
      if (index >= 0) return queue.splice(index, 1)[0];
    }
  }
  clear() { this.queue = []; this.stopRecommendations(); }
  removeById(instanceId: number) {
    const removedRecommendation = this.recommendedQueue.find(song => song.instanceId === instanceId);
    if (removedRecommendation) this.excludeRecommendation(removedRecommendation);
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

  async startHeartMode(provider: MusicProvider = 'netease'): Promise<RecommendationState> {
    if (this.disposed) return this.getRecommendationState();
    if (this.recommendationsEnabled && this.recommendationProvider !== provider) this.stopRecommendations();
    if (!this.recommendationsEnabled) {
      ++this.recommendationGeneration;
      this.recommendationsEnabled = true;
      this.recommendationProvider = provider;
      this.recommendationPhase = provider === 'netease' ? 'heart' : 'roam';
      this.recommendationError = null;
      const initial = (this.currentSong?.song.provider || 'netease') === provider ? this.currentSong?.song.id : undefined;
      this.heartModeSession = this.dependencies.createRecommendationSession?.(provider, initial) || this.dependencies.createHeartSession(initial);
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
    this.recommendationProvider = null;
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
      ...this.getQueue().map(songKey),
      ...(this.currentSong ? [songKey(this.currentSong.song)] : []),
      ...(this.loadingSong ? [songKey(this.loadingSong)] : []),
    ]);
    return songs.filter(song => {
      if (seen.has(songKey(song))) return false;
      seen.add(songKey(song));
      return true;
    });
  }

  private rememberSong(song: Song) {
    const id = songKey(song);
    this.recentSongIds = this.recentSongIds.filter(songId => songId !== id);
    this.recentSongIds.push(id);
    if (this.recentSongIds.length > 100) this.recentSongIds.shift();
  }

  private excludeRecommendation(song: Song) {
    const id = songKey(song);
    this.excludedRecommendationIds = this.excludedRecommendationIds.filter(songId => songId !== id);
    this.excludedRecommendationIds.push(id);
    if (this.excludedRecommendationIds.length > 100) this.excludedRecommendationIds.shift();
  }

  private refillRecommendations(): Promise<void> {
    const session = this.heartModeSession;
    if (this.mode !== 'regular' || !this.recommendationsEnabled || !session || this.refillRetryTimer || this.recommendedQueue.length > 2) return Promise.resolve();
    if (this.refillTask) return this.refillTask;
    const generation = this.recommendationGeneration;
    this.recommendationLoading = true;
    this.recommendationPhase = this.recommendationProvider === 'qqmusic' ? 'roam' : 'heart';
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
          .sort((a, b) => this.recentSongIds.indexOf(songKey(a)) - this.recentSongIds.indexOf(songKey(b))).slice(0, 3);
        this.recommendedQueue.push(...fallback.map(song => ({ ...song, instanceId: ++this.currentInstanceId, source: 'heart' as const })));
        added += fallback.length;
      }
      if (!added && !this.recommendedQueue.length) {
        this.recommendationError = '暂时没有可播放的推荐，30 秒后自动重试';
        console.warn('Heart mode returned no eligible songs; retrying in 30 seconds.', { received: candidates.length });
      }
    } catch (error) {
      if (generation === this.recommendationGeneration) {
        const problem = error instanceof HeartModeError ? error : new HeartModeError(this.recommendationProvider === 'qqmusic' ? 'QQ 漫游暂不可用' : '心动模式暂不可用', true);
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
    const playlistCandidate = this.mode === 'playlist' ? this.playlists.peek() : null;
    if (this.mode === 'playlist' ? !playlistCandidate : !this.peek()) { this.broadcastPlaylists(); if (this.mode === 'regular') void this.refillRecommendations(); return; }
    this.loading = true;
    const generation = this.generation;
    const recommendationGeneration = this.recommendationGeneration;
    let nextSong = this.mode === 'regular' ? this.dequeue()! : null;
    this.loadingSong = nextSong;
    this.broadcastQueue();
    this.broadcastPlaylists();
    void this.refillRecommendations();
    try {
      if (playlistCandidate) {
        const details = await this.dependencies.getPlaylistSong?.(playlistCandidate);
        if (generation !== this.generation) return;
        if (!details) throw new Error('No playlist song details');
        nextSong = { ...details, instanceId: ++this.currentInstanceId, source: 'playlist', playlistEntryId: playlistCandidate.entryId };
        this.loadingSong = nextSong;
      }
      if (!nextSong) throw new Error('No next song');
      if (!this.available(nextSong)) throw new HttpError(409, '房主对应平台授权不可用', 'MUSIC_BINDING_REQUIRED');
      const playInfo = await this.dependencies.getPlayInfo(String(nextSong.id), nextSong);
      if (generation !== this.generation) return;
      if (nextSong.source === 'heart' && (!this.recommendationsEnabled || recommendationGeneration !== this.recommendationGeneration || this.queue.some(song => this.available(song)))) {
        if (this.recommendationsEnabled && recommendationGeneration === this.recommendationGeneration) this.recommendedQueue.unshift(nextSong);
        this.broadcastQueue();
        return;
      }
      if (!playInfo?.url) throw new Error('No playable URL');
      const duration = playInfo.time > 0 ? Math.min(nextSong.duration || playInfo.time, playInfo.time) : nextSong.duration;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid song duration');
      const { url: _url, time: _time, ...metadata } = playInfo;
      const song = { ...nextSong, ...metadata, originalDuration: nextSong.duration || playInfo.originalDuration || duration, duration };
      const startTime = Date.now();
      this.currentSong = { song, url: playInfo.url, startTime };
      if (playlistCandidate) this.playlists.consume(playlistCandidate, true);
      ++this.playbackRevision;
      this.rememberSong(song);
      this.emit({ type: 'PLAY_SONG', payload: this.getPlayback() });
      this.broadcastPlaylists();
      // Song duration is milliseconds. Only the server advances shared playback.
      this.timer = setTimeout(() => {
        if (this.disposed || this.currentSong?.song.instanceId !== song.instanceId) return;
        this.timer = null;
        this.finishCurrentSong();
        void this.startNextSongIfIdle();
      }, duration);
    } catch (error) {
      if (generation === this.generation) {
        if (playlistCandidate) {
          if (error instanceof HttpError && error.status === 409) this.playlists.block(playlistCandidate.entryId, error.message);
          else this.playlists.consume(playlistCandidate, false);
          this.broadcastPlaylists();
        }
        if (nextSong) {
          if (nextSong.source === 'manual' && !this.available(nextSong)) this.queue.unshift(nextSong);
          else {
            this.rememberSong(nextSong);
            if (nextSong.source === 'heart') this.excludeRecommendation(nextSong);
            this.emit({ type: 'PLAYBACK_NOTICE', payload: { message: `${nextSong.name}没有可用音频，已跳过`, provider: nextSong.provider || 'netease' } });
          }
          console.warn('Skipping unavailable track:', nextSong.id);
        }
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.loadingSong = null;
        this.broadcastPlaylists();
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
    if (this.currentSong?.song.source === 'heart') this.excludeRecommendation(this.currentSong.song);
    if (this.loadingSong?.source === 'heart') this.excludeRecommendation(this.loadingSong);
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
  resetAuthorization(provider?: MusicProvider) {
    if (this.disposed) return;
    const selected = this.loadingSong?.provider || (this.mode === 'playlist' && this.playlists.activeEntryId ? this.playlists.get(this.playlists.activeEntryId).index.playlist.provider : 'netease') || 'netease';
    if ((!provider || selected === provider) && this.loading) {
      this.cancelPendingSelection();
    }
    if (provider) this.playlists.invalidateProvider(provider);
    if (!provider || this.recommendationProvider === provider) {
      this.excludedRecommendationIds = this.excludedRecommendationIds.filter(id => provider && !id.startsWith(provider + ':'));
      this.stopRecommendations();
    }
    this.broadcastQueue(); this.broadcastPlaylists(); void this.startNextSongIfIdle();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation; ++this.recommendationGeneration;
    if (this.timer) clearTimeout(this.timer);
    if (this.refillRetryTimer) clearTimeout(this.refillRetryTimer);
    this.timer = null; this.refillRetryTimer = null;
    this.queue = []; this.recommendedQueue = []; this.currentSong = null;
    this.playlists.clear();
    this.heartModeSession = null; this.refillTask = null; this.loadingSong = null;
    this.loading = false; this.recommendationsEnabled = false; this.recommendationLoading = false;
  }
}
