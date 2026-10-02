'use client';

import { useEffect, useState } from 'react';
import { Noto_Sans_SC } from 'next/font/google';
import { useMusicContext } from '@/contexts/MusicContext';
import { apiRequest } from '@/lib/api';

const lyricsFont = Noto_Sans_SC({
  weight: 'variable',
  subsets: ['latin'],
  variable: '--font-lyrics',
  display: 'swap',
  preload: false,
  fallback: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
  adjustFontFallback: false,
});

type LyricLine = { time: number; text: string };
export function parseLyric(lyric: string): LyricLine[] {
  const result: LyricLine[] = [];
  for (const line of lyric.split('\n')) {
    const text = line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    if (!text) continue;
    for (const match of line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
      const [, minute, second, fraction = '0'] = match;
      result.push({ time: Number(minute) * 60 + Number(second) + Number('0.' + fraction), text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

export default function MusicLyrics() {
  const { currentSong, currentPosition, isPreview } = useMusicContext();
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [translations, setTranslations] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const songId = currentSong?.id;
  useEffect(() => {
    setLyrics([]); setTranslations([]); setFailed(false);
    if (!songId || isPreview) return;
    const controller = new AbortController();
    setLoading(true);
    apiRequest<{ success: boolean; data?: { lyric: string; tlyric?: string } }>('/api/netease/lyric?id=' + songId, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted && data.success && data.data) {
          setLyrics(parseLyric(data.data.lyric));
          setTranslations(parseLyric(data.data.tlyric || ''));
        }
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [songId, isPreview]);

  const position = currentPosition / 1000;
  const foundIndex = lyrics.findIndex((line, index) => position >= line.time && (!lyrics[index + 1] || position < lyrics[index + 1].time));
  const index = Math.max(0, foundIndex);
  const active = lyrics[index];
  const translation = active ? translations.find(line => Math.abs(line.time - active.time) < 0.15)?.text : '';
  const before = isPreview || !currentSong ? '把喧嚣留在世界之外' : lyrics[index - 1]?.text || '';
  const center = isPreview ? '我们在同一片夜里相遇。' : !currentSong ? '让音乐，连接此刻的我们。' : loading ? '正在寻找这一句…' : active?.text || (failed ? '歌词暂时无法加载' : '此刻，用心听。');
  const after = isPreview ? '让这一刻，慢一点过去' : !currentSong ? '点一首喜欢的歌，和大家一起听' : lyrics[index + 1]?.text || '';
  return (
    <section className={`${lyricsFont.variable} stage-lyrics`} aria-label="同步歌词">
      <p className="lyric-adjacent lyric-before">{before || '\u00a0'}</p>
      <div className="lyric-current" key={String(songId) + '-' + index}>
        <p>{center}</p>
        {translation && translation !== active?.text && <p className="lyric-translation">{translation}</p>}
      </div>
      <p className="lyric-adjacent lyric-after">{after || '\u00a0'}</p>
    </section>
  );
}
