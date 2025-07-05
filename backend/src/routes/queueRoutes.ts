import express from 'express';
import {
    addSongToQueue, 
    getQueue, 
    removeFromQueueHandler,
    moveToTopHandler,
} from '../controllers/queueController';

const router = express.Router();

router.post('/add', addSongToQueue);
router.get('/list', getQueue);
router.post('/remove', removeFromQueueHandler);
router.post('/moveTop', moveToTopHandler);

export default router;
