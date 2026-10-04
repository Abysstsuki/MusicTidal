export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string; // 封面图 URL
  duration: number;
  source?: 'manual' | 'heart' | 'playlist';
  playlistEntryId?: string;
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
  phase: 'heart' | null;
  queued: number;
  error: string | null;
  paused?: boolean;
}

export interface ChatMessage {
  id?: string;
  userId?: number;
  username: string;
  text: string;
}

export interface PlaybackSnapshot {
  song: Song | null;
  url: string;
  startTime: number;
  playbackRevision?: number;
}
