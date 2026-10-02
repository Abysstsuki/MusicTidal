import express from 'express';
import {
    addSongToQueue, 
    getQueue, 
    removeFromQueueHandler,
    moveToTopHandler,
    getCurrentPlayingSong,
    skipToNextHandler,
    startDailyRecommendationsHandler,
    stopRecommendationsHandler
} from '../controllers/queueController';

const router = express.Router();

router.post('/add', addSongToQueue);
router.get('/list', getQueue);
router.post('/remove', removeFromQueueHandler);
router.post('/moveTop', moveToTopHandler);
router.post('/skipNext', skipToNextHandler);
router.get('/currentPlaying', getCurrentPlayingSong);
router.post('/recommendations/start', startDailyRecommendationsHandler);
router.post('/recommendations/stop', stopRecommendationsHandler);

export default router;
