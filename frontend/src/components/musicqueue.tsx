'use client';

import { useEffect, useRef, useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import MusicItem from './modelItem/MusicItem';
import { Song } from '@/types/music';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

interface SongWithInstanceId extends Song {
  instanceId: number; // 来自后端
}

export default function MusicQueue() {
  const [queue, setQueue] = useState<SongWithInstanceId[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/song/queueList');
      const data = await res.json();
      setQueue(data.queue); // ✅ 后端已含 instanceId
    } catch (err) {
      console.error('获取队列失败', err);
    }
  };

  const moveToTop = async (instanceId: number) => {
    try {
      await fetch('/api/song/queueTop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId }),
      });
    } catch (err) {
      console.error('置顶失败', err);
    }
  };

  const removeFromQueue = async (instanceId: number) => {
    try {
      await fetch('/api/song/queueRemove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId }),
      });
    } catch (err) {
      console.error('删除失败', err);
    }
  };

  useEffect(() => {
    fetchQueue();

    const ws = new WebSocket(`${WS_URL}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'QUEUE_UPDATED') {
          setQueue(data.payload); // ✅ payload 已包含 instanceId
        } else if (data.type === 'PLAY_SONG') {
          // 当歌曲开始播放时，重新获取队列状态以同步显示
          fetchQueue();
        }
      } catch (e) {
        console.error('解析 WebSocket 消息失败', e);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket 错误', err);
    };

    ws.onclose = () => {
      console.log('WebSocket 连接关闭');
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="w-full h-full p-3 relative overflow-hidden">
      <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 overflow-y-auto space-y-3 text-white text-sm">
        {queue.length === 0 ? (
          <div className="p-6 rounded-lg text-center">
            <p className="text-gray-400 text-lg">当前歌曲队列为空，请点歌</p>
          </div>
        ) : (
          queue.map((song, index) => (
            <MusicItem
              id={song.id}
              key={song.instanceId} // ✅ 唯一 key
              index={index}
              prcUrl={song.prcUrl}
              name={song.name}
              artist={song.artist}
              duration={song.duration}
            >
              <div className="flex items-center gap-2 ml-2">
                <button
                  title="置顶"
                  onClick={() => moveToTop(song.instanceId)}
                  className="text-white/50 hover:text-white transition-all"
                >
                  <ArrowUpwardIcon />
                </button>
                <button
                  title="移除"
                  onClick={() => removeFromQueue(song.instanceId)}
                  className="text-white/50 hover:text-red-400 transition-all"
                >
                  <DeleteIcon />
                </button>
              </div>
            </MusicItem>
          ))
        )}
      </div>
    </div>
  );
}
