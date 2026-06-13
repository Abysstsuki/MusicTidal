import { Request, Response } from 'express';
import { songQueueService } from '../services/songQueueService';
import { getSongPlayInfo } from '../services/netease/song.service';

export const addSongToQueue = (req: Request, res: Response) => {
    const song = req.body.song;

    if (!song || !song.id || !song.name) {
        res.status(400).json({ error: '歌曲错误' });
        return;
    }

    const added = songQueueService.enqueue(song);

    res.status(200).json({ message: '加入队列成功', song: added });
    return;
};

export const getQueue = (_req: Request, res: Response) => {
    res.status(200).json({ queue: songQueueService.getQueue() });
    return;
};

export const getCurrentPlayingSong = async (_req: Request, res: Response) => {
  const currentSong = songQueueService.getCurrentSong();
  if (currentSong) {
    try {
      const playInfo = await getSongPlayInfo(currentSong.song.id.toString());
      const currentSongWithUrl = {
        ...currentSong,
        url: playInfo?.url || ''
      };
      res.status(200).json({ success: true, currentSong: currentSongWithUrl });
    } catch (error) {
      console.error('获取歌曲播放信息失败:', error);
      res.status(200).json({ success: true, currentSong });
    }
  } else {
    res.status(200).json({ success: true, currentSong: null });
  }
};

export const removeFromQueueHandler = (req: Request, res: Response) => {
    const { instanceId } = req.body;
    if (typeof instanceId !== 'number') {
        res.status(400).json({ error: 'Invalid song id' })
        return;
    }

    songQueueService.removeById(instanceId);
    res.status(200).json({ success: true });
    return;
};

export const moveToTopHandler = (req: Request, res: Response) => {
    const { instanceId } = req.body;
    if (typeof instanceId !== 'number') {
        res.status(400).json({ error: 'Invalid song id' })
        return;
    }

    songQueueService.moveToTop(instanceId);
    res.status(200).json({ success: true });
    return;
};

export const skipToNextHandler = (_req: Request, res: Response) => {
    songQueueService.skipToNext();
    res.status(200).json({ success: true, message: '已跳到下一首' });
    return;
};