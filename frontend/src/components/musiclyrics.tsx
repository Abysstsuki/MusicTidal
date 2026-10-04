'use client';

import { useEffect, useState } from 'react';
import { Noto_Sans_SC } from 'next/font/google';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToastMessage } from '@/contexts/ToastContext';
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
  const { currentSong, currentPosition, requestRoom } = useMusicContext();
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [translations, setTranslations] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useToastMessage(failed ? '歌词暂时无法加载，请稍后重试' : '', { tone: 'error' });
  const songId = currentSong?.id;
  const provider = currentSong?.provider || 'netease';
  useEffect(() => {
    setLyrics([]); setTranslations([]); setFailed(false);
    if (!songId) return;
    const controller = new AbortController();
    setLoading(true);
    requestRoom<{ lyric: string; tlyric?: string }>('/music/lyric?id=' + songId + '&provider=' + provider, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) {
          setLyrics(parseLyric(data.lyric));
          setTranslations(parseLyric(data.tlyric || ''));
        }
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [songId, provider, requestRoom]);

  const position = (currentPosition + (currentSong?.lyricOffset || 0)) / 1000;
  const foundIndex = lyrics.findIndex((line, index) => position >= line.time && (!lyrics[index + 1] || position < lyrics[index + 1].time));
  const index = Math.max(0, foundIndex);
  const active = lyrics[index];
  const translation = active ? translations.find(line => Math.abs(line.time - active.time) < 0.15)?.text : '';
  if (!currentSong) return null;
  const before = lyrics[index - 1]?.text || '';
  const center = loading ? '正在寻找这一句…' : active?.text || '暂无歌词';
  const after = lyrics[index + 1]?.text || '';
  return (
    <CurvedLyrics before={before} center={center} after={after}
      translation={translation !== active?.text ? translation : undefined}
      lineKey={provider + '-' + String(songId) + '-' + index} animated={!!active}
      fontClass={lyricsFont.variable} />
  );
}
