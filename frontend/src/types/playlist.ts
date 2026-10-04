export type PlaybackMode = 'regular' | 'playlist';
export interface PlaylistSummary {
  provider?: import('./music').MusicProvider;
  id: number; name: string; coverUrl: string; creator: string; trackCount: number; isLiked: boolean;
}
export interface PlaylistEntry extends PlaylistSummary {
  entryId: string; addedBy: { id: number; username: string }; order: 'sequential' | 'shuffle'; repeat: boolean;
  played: number; remaining: number; priorityNext: number[]; error: string | null; completed: boolean;
}
export interface PlaylistState {
  mode: PlaybackMode; activeEntryId: string | null; entries: PlaylistEntry[]; loading: boolean;
}
export interface PlaylistPage<T> {
  items: T[]; total: number | null; offset: number; limit: number; hasMore: boolean; playlist?: PlaylistSummary;
}
export const emptyPlaylists: PlaylistState = { mode: 'regular', activeEntryId: null, entries: [], loading: false };
