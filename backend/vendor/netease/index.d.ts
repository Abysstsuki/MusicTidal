export interface NeteaseQuery extends Record<string, unknown> {
  cookie?: string;
  anonymousToken?: string;
  realIP?: string;
  timeout?: number;
}

export interface NeteaseResponse {
  status: number;
  body: any;
  cookie: string[];
}

export type NeteaseModule = (query?: NeteaseQuery) => Promise<NeteaseResponse>;
export const login_qr_key: NeteaseModule;
export const login_qr_check: NeteaseModule;
export const login_status: NeteaseModule;

export function cookieToJson(cookie?: string): Record<string, string>;
export const cloudsearch: NeteaseModule;
export const song_url_v1: NeteaseModule;
export const lyric: NeteaseModule;
export const user_account: NeteaseModule;
export const recommend_songs: NeteaseModule;
export const personal_fm: NeteaseModule;
export const user_playlist: NeteaseModule;
export const likelist: NeteaseModule;
export const playmode_intelligence_list: NeteaseModule;
export const register_anonimous: NeteaseModule;
