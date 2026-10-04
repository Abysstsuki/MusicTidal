export type MusicProvider = 'netease' | 'qqmusic';
export type MusicAccess = 'free' | 'vip' | 'paid' | 'quality' | 'unknown';
export interface PlayInfo {
  url: string; time: number; trial?: boolean; lyricOffset?: number; audioOffset?: number;
  originalDuration?: number; format?: string;
}
export const songKey = (song: Pick<Song, 'id' | 'provider'>) => `${song.provider || 'netease'}:${song.id}`;
export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string;
  duration: number;
  provider?: MusicProvider;
  mid?: string;
  mediaMid?: string;
  access?: MusicAccess;
  rights?: { play?: number; membership?: number; download?: number };
  trial?: boolean;
  lyricOffset?: number;
  audioOffset?: number;
  originalDuration?: number;
  format?: string;
  unavailableReason?: string | null;
}
export interface SongWithInstance extends Song {
  instanceId: number;
  source?: 'manual' | 'heart' | 'playlist';
  playlistEntryId?: string;
}

export interface RecommendationState {
  enabled: boolean;
  loading: boolean;
  phase: 'heart' | 'roam' | null;
  provider?: MusicProvider | null;
  queued: number;
  error: string | null;
  paused?: boolean;
}
