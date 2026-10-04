import type { ChatMessage, PlaybackSnapshot, QueueSong, RecommendationState } from './music';
import type { PlaylistState } from './playlist';

export interface NeteaseBinding {
  status: 'unbound' | 'bound' | 'expired';
  profile: { uid: string; nickname: string; avatarUrl: string } | null;
  boundAt: string | null;
}
export interface RoomSummary {
  id: string; name: string; host: { id: number; username: string }; locked: boolean; onlineCount: number;
  currentSong: { id: number; name: string; artist: string; prcUrl: string } | null;
  hostDisconnectedUntil: number | null;
  hostGracePeriodMs?: number;
}
export interface RoomInfo extends RoomSummary { binding: NeteaseBinding; inviteToken: string | null }
export interface RoomState {
  room: RoomInfo; revision: number; playback: PlaybackSnapshot; queue: QueueSong[];
  recommendations: RecommendationState; members: { id: number; username: string; isHost: boolean }[]; messages: ChatMessage[];
  playlists?: PlaylistState;
}
