export interface Song {
  id: number;
  name: string;
  artist: string;
  prcUrl: string;
  duration: number;
}
export interface SongWithInstance extends Song {
  instanceId: number;
}
