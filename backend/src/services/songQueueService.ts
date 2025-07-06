import { Song, SongWithInstance } from '../types/song';
import { broadcast } from './websocketServer';
import { getSongPlayInfo } from '../services/netease/song.service';
class SongQueueService {
  private queue: SongWithInstance[] = [];
  private currentInstanceId = 0;
  private currentSong: { song: Song; startTime: number } | null = null;

  getCurrentSong() {
    return this.currentSong;
  }
  enqueue(song: Song) {
    const instanceId = ++this.currentInstanceId;
    const songWithInstance = { ...song, instanceId };
    this.queue.push(songWithInstance);
    this.broadcastQueue();
    this.startNextSongIfIdle();
    return songWithInstance;
  }

  
  dequeue() {
    return this.queue.shift();
  }

  getQueue() {
    return this.queue;
  }

  peek() {
    return this.queue[0];
  }

  clear() {
    this.queue = [];
    this.broadcastQueue();
  }

  removeById(instanceId: number) {
    this.queue = this.queue.filter(s => s.instanceId !== instanceId);
    this.broadcastQueue();
  }

  moveToTop(instanceId: number) {
    const index = this.queue.findIndex(s => s.instanceId === instanceId);
    if (index !== -1) {
      const [song] = this.queue.splice(index, 1);
      this.queue.unshift(song);
      this.broadcastQueue();
    }
  }
  async startNextSongIfIdle() {
    if (this.currentSong || this.queue.length === 0) return;
    const nextSong = this.dequeue();
    if (!nextSong) return;
    const playInfo = await getSongPlayInfo(nextSong.id.toString());
    if (!playInfo?.url) return;

    const startTime = Date.now();
    this.currentSong = { song: nextSong, startTime };

    // 通知所有客户端
    broadcast({
      type: 'PLAY_SONG',
      payload: {
        song: nextSong,
        url: playInfo.url,
        startTime,
      },
    });

    // 定时播放下一首
    setTimeout(() => {
      this.currentSong = null;
      this.startNextSongIfIdle(); // 自动播放下一首
    }, nextSong.duration * 1000); // duration 单位：秒
  }

  skipToNext() {
    // 停止当前歌曲
    this.currentSong = null;
    // 立即开始下一首
    this.startNextSongIfIdle();
  }

  private broadcastQueue() {
    broadcast({ type: 'QUEUE_UPDATED', payload: this.queue });
  }
}

export const songQueueService = new SongQueueService();
