import { Song } from '../types/song';
import { broadcast } from './websocketServer';

class SongQueueService {
  private queue: Song[] = [];

  enqueue(song: Song) {
    this.queue.push(song);
    this.broadcastQueue();
    return song;
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

  removeById(id: number) {
    this.queue = this.queue.filter((s) => s.id !== id);
    this.broadcastQueue();
  }

  moveToTop(id: number) {
    const index = this.queue.findIndex((s) => s.id === id);
    if (index > -1) {
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
