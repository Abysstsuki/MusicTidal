import { Router } from 'express';
import { getSongUrlHandler } from '../controllers/netease/song.controller';
import { searchSongHandler } from '../controllers/netease/search.controller';

const router = Router();

router.get('/song/url', getSongUrlHandler);
router.get('/song/search', searchSongHandler); // 新增搜索路由
export default router;
