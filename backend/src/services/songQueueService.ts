import { Song } from '../types/song';

class SongQueueService {
  private queue: Song[] = [];

  enqueue(song: Song) {
    this.queue.push(song);
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
  }

  removeById(id: number) {
    this.queue = this.queue.filter((s) => s.id !== id);
  }

  moveToTop(id: number) {
    const index = this.queue.findIndex((s) => s.id === id);
    if (index > -1) {
      const [song] = this.queue.splice(index, 1);
      this.queue.unshift(song);
    }
  }
}

export const songQueueService = new SongQueueService();
