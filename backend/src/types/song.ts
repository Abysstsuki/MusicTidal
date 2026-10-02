export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string;
  duration: number;
}
export interface SongWithInstance extends Song {
  instanceId: number;
  source?: 'manual' | 'daily' | 'fm';
}

export interface RecommendationState {
  enabled: boolean;
  loading: boolean;
  phase: 'daily' | 'fm' | null;
  queued: number;
  error: string | null;
}
