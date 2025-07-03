import { Request, Response } from 'express';
import { searchSongByKeyword } from '../../services/netease/song.service';

export const searchSongHandler = async (req: Request, res: Response): Promise<void> => {
    const keywords = req.query.keywords as string;

    if (!keywords || keywords.trim() === '') {
        res.status(400).json({ success: false, error: 'Missing or empty keywords' });
        return;
    }

    try {
        const results = await searchSongByKeyword(keywords);
        res.json({ success: true, data: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to search songs' });
    }
};
