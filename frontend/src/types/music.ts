export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string; // 封面图 URL
  duration: number;
}
export interface SongSearchResponse {
  success: boolean;
  data: Song[];
}