'use client';

import { useEffect, useState } from 'react';
import { Noto_Sans_SC } from 'next/font/google';
import { useMusicContext } from '@/contexts/MusicContext';
import { apiRequest } from '@/lib/api';
import CurvedLyrics from '@/components/curvedlyrics';

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
  if (!currentSong) return null;
  const before = isPreview ? '上一句歌词' : lyrics[index - 1]?.text || '';
  const center = isPreview ? '歌词预览' : loading ? '正在寻找这一句…' : active?.text || (failed ? '歌词暂时无法加载' : '暂无歌词');
  const after = isPreview ? '下一句歌词' : lyrics[index + 1]?.text || '';
  return (
    <CurvedLyrics before={before} center={center} after={after}
      translation={isPreview ? 'Translation preview' : translation !== active?.text ? translation : undefined}
      lineKey={String(songId) + '-' + index} animated={isPreview || !!active}
      fontClass={lyricsFont.variable} />
  );
}
