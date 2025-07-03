// song.controller.ts
import { Request, Response } from 'express';
import { getSongPlayInfo } from '../../services/netease/song.service';

export const getSongUrlHandler = async (req: Request, res: Response): Promise<void> => {
    const songId = req.query.id as string;
    
    if (!songId) {
        res.status(400).json({ error: 'Missing song id' });
        return;
    }
    
    try {
        const songInfo = await getSongPlayInfo(songId);
        res.json({ success: true, data: songInfo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch song URL' });
    }
};