import type { Song, MusicAccess, MusicProvider } from '../../types/song';
import { HttpError } from '../../utils/httpError';
export const providerName = (provider: MusicProvider) => provider === 'qqmusic' ? 'QQ 音乐' : '网易云';
export function musicProvider(value: unknown): MusicProvider {
  if (value === undefined || value === 'netease') return 'netease';
  if (value === 'qqmusic') return value;
  throw new HttpError(400, '音乐平台无效');
}
export function neteaseSong(raw: any, privilege?: any): Song {
  const fee = Number(raw.fee ?? privilege?.fee ?? NaN);
  const access: MusicAccess = fee === 1 ? 'vip' : fee === 4 ? 'paid' : fee === 8 ? 'quality' : fee === 0 ? 'free' : 'unknown';
  return { provider: 'netease', id: Number(raw.id), name: String(raw.name || ''),
    artist: (raw.ar || raw.artists || []).map((a: any) => a.name).join(', '),
    prcUrl: String(raw.al?.picUrl || raw.album?.picUrl || ''), duration: Number(raw.dt || raw.duration) || 0, access };
}
export function qqSong(raw: any): Song {
  const pay = raw.pay || {}, vip = raw.vip || {};
  // Download-only fees are not a playback VIP restriction.
  const access: MusicAccess = Number(pay.pay_play) === 1
    ? (Number(pay.pay_month) === 1 ? 'vip' : Number(pay.price_track) > 0 || Number(pay.price_album) > 0 ? 'paid' : 'unknown')
    : Number(vip.vip_play) === 1 ? 'vip' : pay.pay_play !== undefined && Number(pay.pay_play) === 0 ? 'free' : 'unknown';
  const album = raw.album || {};
  return { provider: 'qqmusic', id: Number(raw.id || raw.songid), mid: String(raw.mid || raw.songmid || ''),
    mediaMid: String(raw.file?.media_mid || raw.strMediaMid || ''), name: String(raw.title || raw.name || raw.songname || ''),
    artist: (raw.singer || []).map((a: any) => a.name).join(', '),
    prcUrl: (album.mid || raw.albummid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid || raw.albummid}.jpg` : '',
    duration: (Number(raw.interval) || 0) * 1000, access,
    rights: { play: pay.pay_play === undefined ? undefined : Number(pay.pay_play),
      membership: pay.pay_month === undefined ? undefined : Number(pay.pay_month),
      download: pay.pay_down === undefined ? undefined : Number(pay.pay_down) } };
}
