import { Router } from 'express';
import type { Room } from '../services/roomManager';
import type { MusicProvider, Song } from '../types/song';
import { musicProvider } from '../services/music/song';
import { searchSongByKeyword, getSongPlayInfo, getSongLyric } from '../services/netease/song.service';
import { pagination, positiveId } from '../services/netease/playlist.service';
import { HttpError } from '../utils/httpError';
const router = Router();
router.get('/song/search', async (req, res) => {
  const room = res.locals.room as Room, keywords = String(req.query.keywords || '').trim();
  if (!keywords || keywords.length > 100) throw new HttpError(400, '请输入 1–100 字的关键词');
  const page = pagination(req.query), enabled = room.info().enabledProviders;
  const providers: Partial<Record<MusicProvider, any>> = {};
  await Promise.all(enabled.map(async provider => {
    const offset = req.query[provider + 'Offset'] === undefined ? page.offset : Number(req.query[provider + 'Offset']);
    const { limit } = pagination({ offset, limit: page.limit });
    const version = provider === 'netease' ? room.credentialVersion : room.qqmusicVersion;
    try {
      // QQ search needs the room's bound credentials, including the super room's public account.
      const data = provider === 'netease' ? await searchSongByKeyword(keywords, offset, limit, room.catalogClient) : await room.qqmusicClient.search(keywords, offset, limit);
      if (room.closed || version !== (provider === 'netease' ? room.credentialVersion : room.qqmusicVersion)) throw new HttpError(409, '音乐绑定已变化，请重新搜索');
      providers[provider] = { ...data, offset, limit, hasMore: offset + limit < data.total, error: null };
    } catch (error) { providers[provider] = { songs: [], total: null, offset, limit, hasMore: false,
      error: error instanceof HttpError ? error.message : '平台暂不可用', code: error instanceof HttpError ? error.code : 'MUSIC_UNAVAILABLE' }; }
  }));
  const songs: Song[] = [];
  const left = providers.netease?.songs || [], right = providers.qqmusic?.songs || [];
  for (let index = 0; index < Math.max(left.length, right.length); ++index) {
    if (left[index]) songs.push(left[index]); if (right[index]) songs.push(right[index]);
  }
  res.json({ songs, providers, enabledProviders: room.info().enabledProviders, hasMore: enabled.some(provider => providers[provider]?.hasMore),
    total: enabled.reduce((total, provider) => total + (providers[provider]?.total || 0), 0) });
});
router.get('/song/url', async (req, res) => {
  const room = res.locals.room as Room, provider = musicProvider(req.query.provider), id = positiveId(req.query.id);
  room.requireProvider(provider);
  res.json(provider === 'netease' ? await getSongPlayInfo(String(id), room.client) : await room.qqmusicClient.play({ id, provider, name: '', artist: '', prcUrl: '', duration: 0 }));
});
router.get('/lyric', async (req, res) => {
  const room = res.locals.room as Room, provider = musicProvider(req.query.provider), id = positiveId(req.query.id);
  room.requireProvider(provider);
  res.json(provider === 'netease' ? await getSongLyric(String(id), room.catalogClient) : await room.catalogQqmusicClient.lyric(id));
});
export default router;
