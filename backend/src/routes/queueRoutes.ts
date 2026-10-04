import express from 'express';
import { roomManager } from '../services/roomManager';
import type { AuthRequest } from '../middlewares/authMiddleware';
import { HttpError } from '../utils/httpError';
import {
    addSongToQueue,
    addSongsToQueue,
    getQueue, 
    removeFromQueueHandler,
    moveToTopHandler,
    getCurrentPlayingSong,
    skipToNextHandler,
    startHeartModeHandler,
    stopRecommendationsHandler
} from '../controllers/queueController';

const router = express.Router({ mergeParams: true });
router.post('/mode', (req: AuthRequest, res) => {
    const mode = req.body?.mode;
    if (mode !== 'regular' && mode !== 'playlist') throw new HttpError(400, '播放模式无效');
    const room = roomManager.host(String(req.params.roomId), req.user!.userId);
    room.queue.setMode(mode); res.json(room.queue.getPlaylistState());
});

router.post('/add', addSongToQueue);
router.post('/add-batch', addSongsToQueue);
router.get('/list', getQueue);
router.post('/remove', removeFromQueueHandler);
router.post('/moveTop', moveToTopHandler);
router.post('/skipNext', skipToNextHandler);
router.get('/currentPlaying', getCurrentPlayingSong);
router.post('/recommendations/start', startHeartModeHandler);
router.post('/recommendations/stop', stopRecommendationsHandler);

export default router;
