import express from 'express';
import {
    addSongToQueue, 
    getQueue, 
    removeFromQueueHandler,
    moveToTopHandler,
    getCurrentPlayingSong,
    skipToNextHandler
} from '../controllers/queueController';

const router = express.Router();

router.post('/add', addSongToQueue);
router.get('/list', getQueue);
router.post('/remove', removeFromQueueHandler);
router.post('/moveTop', moveToTopHandler);
router.post('/skipNext', skipToNextHandler);
router.get('/currentPlaying', getCurrentPlayingSong);

export default router;
