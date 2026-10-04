export type PlaybackMode = 'regular' | 'playlist';
export type PlaylistOrder = 'sequential' | 'shuffle';
export interface PlaylistSummary {
  id: number; name: string; coverUrl: string; creator: string; trackCount: number; isLiked: boolean;
}
export interface PlaylistIndex { playlist: PlaylistSummary; trackIds: number[] }
export interface PlaylistEntry extends PlaylistSummary {
  entryId: string; addedBy: { id: number; username: string }; order: PlaylistOrder; repeat: boolean;
  played: number; remaining: number; priorityNext: number[]; error: string | null; completed: boolean;
}
export interface PlaylistState {
  mode: PlaybackMode; activeEntryId: string | null; entries: PlaylistEntry[]; loading: boolean;
}
