import { neteaseAxios } from '../../utils/axiosNetease';
interface SongSearchResult {
    id: number;
    name: string;
    artist: string;
    prcUrl: string;
    album: string;
    duration: number;
}
export const searchSongByKeyword = async (keywords: string): Promise<SongSearchResult[]> => {
    const response = await neteaseAxios.get('/cloudsearch', {
        params: {
            keywords,
            type: 1, // type 1 表示单曲搜索
            limit: 50, // 默认返回前10条
        },
    });

    const songs = response.data?.result?.songs;

    if (!Array.isArray(songs)) {
        throw new Error('No search results found.');
    }

    return songs.map((song: any): SongSearchResult => ({
        id: song.id,
        name: song.name,
        artist: song.ar?.map((a: any) => a.name).join(', ') || '',
        prcUrl: song.al?.picUrl || '',
        album: song.al?.name || '',
        duration: song.dt || 0,
    }));
};


export const getSongPlayInfo = async (songId: string) => {
    const response = await neteaseAxios.get('/song/url/v1', {
        params: {
            id: songId,
            level: 'exhigh',
        },
    });

    const data = response.data?.data?.[0];
    if (!data || !data.url) {
        throw new Error('No valid song URL found.');
    }

    return {
        id: data.id,
        url: data.url,
        time: data.time, // duration in ms
    };
};
