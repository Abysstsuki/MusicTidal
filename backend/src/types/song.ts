export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string;
  duration: number;
}
export interface SongWithInstance extends Song {
  instanceId: number;
  source?: 'manual' | 'fm';
}

export interface RecommendationState {
  enabled: boolean;
  loading: boolean;
  phase: 'fm' | null;
  queued: number;
  error: string | null;
}
