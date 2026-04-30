import { Router } from 'express';
import { getSongUrlHandler } from '../controllers/netease/song.controller';
import { searchSongHandler } from '../controllers/netease/search.controller';
import { getSongLyricHandler } from '../controllers/netease/lyric.controller';

const router = Router();

router.get('/song/url', getSongUrlHandler);
router.get('/song/search', searchSongHandler);
router.get('/lyric', getSongLyricHandler);

export default router;
