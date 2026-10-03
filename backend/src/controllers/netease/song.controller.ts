// song.controller.ts
import { Request, Response } from 'express';
import { getSongPlayInfo } from '../../services/netease/song.service';
import { Room } from '../../services/roomManager';

export const getSongUrlHandler = async (req: Request, res: Response): Promise<void> => {
    const songId = req.query.id as string;
    
    if (!songId) {
        res.status(400).json({ error: 'Missing song id' });
        return;
    }
    
    try {
        const songInfo = await getSongPlayInfo(songId, (res.locals.room as Room).client);
        res.json({ success: true, data: songInfo });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch song URL' });
    }
};
