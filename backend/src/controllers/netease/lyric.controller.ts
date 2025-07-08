import { Request, Response } from 'express';
import { getSongLyric } from '../../services/netease/song.service';

export const getSongLyricHandler = async (req: Request, res: Response): Promise<void> => {
    const songId = req.query.id as string;
    
    if (!songId) {
        res.status(400).json({ error: 'Missing song id' });
        return;
    }
    
    try {
        const lyricData = await getSongLyric(songId);
        res.json({ success: true, data: lyricData });
    } catch (err) {
        console.error('获取歌词失败:', err);
        res.status(500).json({ error: 'Failed to fetch song lyric' });
    }
};