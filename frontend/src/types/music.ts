export type MusicProvider = 'netease' | 'qqmusic';
export interface SongReference { provider: MusicProvider; id: number }
export interface BatchQueueFailure extends SongReference { code: string; message: string }
export interface BatchQueueResult {
  success: true; added: QueueSong[]; failed: BatchQueueFailure[]; duplicateCount: number;
}
export const providerName = (provider?: MusicProvider) => provider === 'qqmusic' ? 'QQ 音乐' : '网易云';
export const songKey = (song: Pick<Song, 'id' | 'provider'>) => `${song.provider || 'netease'}:${song.id}`;
export interface Song {
  provider?: MusicProvider;
  mid?: string;
  mediaMid?: string;
  access?: 'free' | 'vip' | 'paid' | 'quality' | 'unknown';
  rights?: { play?: number; membership?: number; download?: number };
  trial?: boolean;
  lyricOffset?: number;
  audioOffset?: number;
  originalDuration?: number;
  format?: string;
  unavailableReason?: string | null;
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
  available: boolean;
  disabledReason: string | null;
  enabled: boolean;
  loading: boolean;
  phase: 'heart' | 'roam' | null;
  provider?: MusicProvider | null;
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
