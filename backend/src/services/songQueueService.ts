import { Song,SongWithInstance } from '../types/song';
import { broadcast } from './websocketServer';

class SongQueueService {
  private queue: SongWithInstance[] = [];
  private currentInstanceId = 0;

  enqueue(song: Song) {
    const instanceId = ++this.currentInstanceId;
    const songWithInstance = { ...song, instanceId };
    this.queue.push(songWithInstance);
    this.broadcastQueue();
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

  private broadcastQueue() {
    broadcast({ type: 'QUEUE_UPDATED', payload: this.queue });
  }
}

export const songQueueService = new SongQueueService();
