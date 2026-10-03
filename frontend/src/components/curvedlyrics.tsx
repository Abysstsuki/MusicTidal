'use client';

import { useEffect, useRef } from 'react';
import { useMusicContext } from '@/contexts/MusicContext';
import type { createLyricScene } from '@/lib/lyric-scene';

type Props = { before: string; center: string; after: string; translation?: string; lineKey: string; animated: boolean; fontClass: string };

export default function CurvedLyrics({ before, center, after, translation, lineKey, animated, fontClass }: Props) {
  const { isPlaying, isPreview, rhythmReader } = useMusicContext();
  const hostRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReturnType<typeof createLyricScene> | null>(null);
  const motionRef = useRef({ playing: isPlaying, preview: isPreview });
  useEffect(() => {
    motionRef.current = { playing: isPlaying, preview: isPreview };
    sceneRef.current?.wake();
  }, [isPlaying, isPreview]);
  useEffect(() => {
    if (!animated) return;
    let disposed = false, generation = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = window.matchMedia('(forced-colors: active)');
    const setup = () => {
      const version = ++generation;
      sceneRef.current?.dispose(); sceneRef.current = null;
      if (reduced.matches || contrast.matches) return;
      void import('@/lib/lyric-scene').then(({ createLyricScene }) => {
        if (disposed || version !== generation || !hostRef.current || !copyRef.current || !canvasRef.current) return;
        try {
          sceneRef.current = createLyricScene(hostRef.current, copyRef.current, canvasRef.current, () => ({
            ...motionRef.current,
            rhythm: motionRef.current.playing ? rhythmReader.current() : { pulse: 0, energy: 0, bassWeight: 0 },
          }));
        } catch { /* Keep readable DOM lyrics if WebGL is unsupported. */ }
      }).catch(() => { /* Keep DOM lyrics if the optional scene chunk cannot load. */ });
    };
    setup();
    reduced.addEventListener('change', setup);
    contrast.addEventListener('change', setup);
    return () => {
      disposed = true; generation++;
      reduced.removeEventListener('change', setup);
      contrast.removeEventListener('change', setup);
      sceneRef.current?.dispose(); sceneRef.current = null;
    };
  }, [animated, rhythmReader]);
  useEffect(() => { sceneRef.current?.refresh(); }, [before, center, after, translation, lineKey]);
  return (
    <section className={`${fontClass} stage-lyrics`} ref={hostRef} aria-label="同步歌词">
      <div className="lyric-copy" ref={copyRef} data-line={lineKey}>
        <p className="lyric-adjacent lyric-before">{before || '\u00a0'}</p>
        <div className="lyric-current" key={lineKey}>
          <p>{center}</p>
          {translation && <p className="lyric-translation">{translation}</p>}
        </div>
        <p className="lyric-adjacent lyric-after">{after || '\u00a0'}</p>
      </div>
      <canvas className="lyric-surface" ref={canvasRef} aria-hidden="true" />
    </section>
  );
}
