import { Request, Response } from 'express';
import { searchSongByKeyword } from '../../services/netease/song.service';
import { Room } from '../../services/roomManager';

export const searchSongHandler = async (req: Request, res: Response): Promise<void> => {
    const keywords = req.query.keywords as string;
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

    if (!keywords || keywords.trim() === '') {
        res.status(400).json({ success: false, error: 'Missing or empty keywords' });
        return;
    }

    try {
        const { songs, total } = await searchSongByKeyword(keywords, offset, limit, (res.locals.room as Room).catalogClient);
        res.json({ success: true, data: songs, total, offset, limit });
    } catch (err: any) {
        res.status(502).json({ success: false, error: '歌曲暂时无法搜索，请稍后重试' });
    }
};
