// types/wsEvent.ts
import { Song } from './song';
export type WSEvent =
  | { type: 'QUEUE_UPDATED'; payload: Song[] };