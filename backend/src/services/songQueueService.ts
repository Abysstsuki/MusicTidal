import { Song, SongWithInstance } from '../types/song';
import { broadcast, setCurrentSongInfo } from './websocketServer';
import { getSongPlayInfo } from './netease/song.service';

class SongQueueService {
  private queue: SongWithInstance[] = [];
  private currentInstanceId = 0;
  private currentSong: { song: Song; startTime: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = false;
  private generation = 0;

  getCurrentSong() { return this.currentSong; }
  getQueue() { return this.queue; }
  peek() { return this.queue[0]; }

  enqueue(song: Song) {
    const added = { ...song, instanceId: ++this.currentInstanceId };
    this.queue.push(added);
    this.broadcastQueue();
    void this.startNextSongIfIdle();
    return added;
  }

  dequeue() { return this.queue.shift(); }
  clear() { this.queue = []; this.broadcastQueue(); }
  removeById(instanceId: number) {
    this.queue = this.queue.filter(song => song.instanceId !== instanceId);
    this.broadcastQueue();
  }
  moveToTop(instanceId: number) {
    const index = this.queue.findIndex(song => song.instanceId === instanceId);
    if (index !== -1) {
      const [song] = this.queue.splice(index, 1);
      this.queue.unshift(song);
      this.broadcastQueue();
    }
  }

  async startNextSongIfIdle() {
    if (this.currentSong || this.loading || !this.queue.length) return;
    this.loading = true;
    const generation = this.generation;
    const nextSong = this.dequeue()!;
    this.broadcastQueue();
    try {
      const playInfo = await getSongPlayInfo(String(nextSong.id));
      if (generation !== this.generation) return;
      if (!playInfo?.url) throw new Error('No playable URL');
      const duration = nextSong.duration > 0 ? nextSong.duration : playInfo.time;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid song duration');
      const song = { ...nextSong, duration };
      const startTime = Date.now();
      this.currentSong = { song, startTime };
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
      if (generation === this.generation) console.warn('Skipping unavailable track:', nextSong.id);
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        if (!this.currentSong) void this.startNextSongIfIdle();
      }
    }
  }

  skipToNext() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loading = false;
    this.finishCurrentSong();
    void this.startNextSongIfIdle();
  }

  private finishCurrentSong() {
    this.currentSong = null;
    setCurrentSongInfo(null, '', 0);
    broadcast({ type: 'PLAY_SONG', payload: { song: null, url: '', startTime: 0 } });
  }
  private broadcastQueue() { broadcast({ type: 'QUEUE_UPDATED', payload: this.queue }); }
}

export const songQueueService = new SongQueueService();
