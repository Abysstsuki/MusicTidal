export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string; // 封面图 URL
  duration: number;
  source?: 'manual' | 'daily' | 'fm';
}
export interface SongSearchResponse {
  success: boolean;
  data: Song[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface QueueSong extends Song {
  instanceId: number;
}

export interface RecommendationState {
  enabled: boolean;
  loading: boolean;
  phase: 'daily' | 'fm' | null;
  queued: number;
  error: string | null;
}

export interface ChatMessage {
  username: string;
  text: string;
}

export interface PlaybackSnapshot {
  song: Song | null;
  url: string;
  startTime: number;
}
