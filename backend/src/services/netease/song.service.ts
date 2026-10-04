import { neteaseHttp, NeteaseApiError, type NeteaseClient } from '../../utils/neteaseHttp';
import { neteaseSong } from '../music/song';
import type { Song, PlayInfo } from '../../types/song';
import { HttpError } from '../../utils/httpError';
export const searchSongByKeyword = async (keywords: string, offset = 0, limit = 10, client: NeteaseClient = neteaseHttp): Promise<{ songs: Song[]; total: number }> => {
  const response = await client.get('/cloudsearch', { params: { keywords, type: 1, limit, offset } });
  const result = response.data?.result;
  if (!result || (result.songs !== undefined && !Array.isArray(result.songs))) throw new HttpError(502, '网易云搜索暂不可用');
  const raw = result.songs || [];
  let details: any = {};
  if (raw.length) details = (await client.get('/song/detail', { params: { ids: raw.map((song: any) => song.id).join(',') } })).data || {};
  const privileges = new Map((details.privileges || []).map((p: any) => [p.id, p]));
  const metadata = new Map((details.songs || []).map((s: any) => [s.id, s]));
  return { songs: raw.map((song: any) => neteaseSong({ ...song, ...(metadata.get(song.id) as object || {}) }, privileges.get(song.id))), total: result.songCount ?? raw.length };
};
export const getSongPlayInfo = async (songId: string, client: NeteaseClient = neteaseHttp): Promise<PlayInfo> => {
  let fallback: PlayInfo | null = null;
  for (const level of ['exhigh', 'standard']) {
    let response;
    try { response = await client.get('/song/url/v1', { params: { id: songId, level } }); }
    catch (error) {
      if ((error instanceof NeteaseApiError && [301, 401, 409].includes(error.code)) ||
          (error instanceof HttpError && error.status === 409)) throw error;
      continue;
    }
    const data = response.data?.data?.[0];
    if (!data?.url) continue;
    const trial = data.freeTrialInfo;
    const start = Number(trial?.start || 0) * 1000, end = Number(trial?.end || 0) * 1000;
    const info: PlayInfo = { url: data.url, time: end > start ? end - start : Number(data.time) || 0,
      trial: Boolean(trial), lyricOffset: end > start ? start : 0, audioOffset: 0,
      originalDuration: Number(data.time) || 0, format: String(data.type || 'mp3').toLowerCase() };
    if (!trial) return info;
    if (end > start) fallback = info;
  }
  if (fallback) return fallback;
  throw new HttpError(502, '网易云没有可用的完整或试听音频', 'NO_PLAYABLE_AUDIO');
};
export const getSongLyric = async (songId: string, client: NeteaseClient = neteaseHttp) => {
  const { data } = await client.get('/lyric', { params: { id: songId } });
  if (!data) throw new HttpError(502, '网易云歌词暂不可用');
  return { lyric: data.lrc?.lyric || '', tlyric: data.tlyric?.lyric || '', romalrc: data.romalrc?.lyric || '' };
};
