'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { quietRhythm, RHYTHM_BUFFER_SIZE, RHYTHM_HOP_SIZE, type RhythmReader } from '@/lib/audio-rhythm';
import type { createRhythmDetector } from '@/lib/rhythm-detector';

type Graph = {
  audio: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode | null;
  sampler: AudioWorkletNode | null;
  detector: ReturnType<typeof createRhythmDetector> | null;
  version: number;
  opening: boolean;
  analysisAttempted: boolean;
};

export function useAudioRhythm(audioRef: RefObject<HTMLAudioElement | null>, reader: RefObject<RhythmReader>) {
  const graphRef = useRef<Graph | null>(null);
  const disposalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (disposalTimer.current) clearTimeout(disposalTimer.current);
    let disposed = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const enabled = (graph: Graph) => !document.hidden && !reduced.matches && !graph.audio.paused && !graph.audio.ended
      && !graph.audio.muted && graph.audio.volume > 0 && graph.context.state === 'running';
    const resetSampling = () => {
      const graph = graphRef.current;
      if (!graph) return;
      graph.version++;
      graph.detector?.reset();
      graph.sampler?.port.postMessage({ enabled: enabled(graph), version: graph.version });
    };
    const release = () => {
      const graph = graphRef.current;
      graphRef.current = null;
      reader.current = quietRhythm;
      if (graph) {
        graph.source?.disconnect();
        if (graph.sampler) {
          graph.sampler.port.onmessage = null;
          graph.sampler.port.close();
          graph.sampler.disconnect();
        }
        void graph.context.close().catch(() => {});
      }
    };
    const bindSampling = (graph: Graph) => {
      const { sampler, detector } = graph;
      if (sampler && detector) {
        sampler.port.onmessage = ({ data }: MessageEvent<{ buffer: Float32Array; time: number; version: number }>) => {
          if (disposed || graphRef.current !== graph || data.version !== graph.version || !enabled(graph)) return;
          // Avoid replaying queued transients after the main thread becomes busy.
          if (graph.context.currentTime - data.time > 0.15) return;
          try {
            // MediaElementAudioSource includes the element's volume. Restore
            // the original amplitude in this silent analysis branch so the
            // demo's absolute RMS thresholds work at any listening volume.
            const volume = graph.audio.volume;
            if (volume < 1) for (let i = 0; i < data.buffer.length; i++) data.buffer[i] /= volume;
            detector.ingest(data.buffer, data.time);
          }
          catch (error) {
            if (process.env.NODE_ENV !== 'production') console.warn('Lyric rhythm extraction unavailable', error);
            reader.current = quietRhythm;
            sampler.port.onmessage = null;
            graph.source?.disconnect(sampler);
            sampler.disconnect();
          }
        };
        reader.current = () => !disposed && enabled(graph) ? detector.read(graph.context.currentTime) : quietRhythm();
      }
    };
    const setupAnalysis = async (graph: Graph) => {
      if (graph.sampler) { bindSampling(graph); return; }
      if (graph.analysisAttempted || !graph.context.audioWorklet) return;
      graph.analysisAttempted = true;
      try {
        const [{ createRhythmDetector }] = await Promise.all([
          import('@/lib/rhythm-detector'),
          graph.context.audioWorklet.addModule(new URL('audio/rhythm-sampler.js', document.baseURI).href),
        ]);
        if (disposed || graphRef.current !== graph || graph.context.state === 'closed') {
          graph.analysisAttempted = false;
          return;
        }
        graph.detector = createRhythmDetector(graph.context.sampleRate);
        graph.sampler = new AudioWorkletNode(graph.context, 'music-tidal-rhythm', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          channelCount: 1, channelCountMode: 'explicit',
          processorOptions: { bufferSize: RHYTHM_BUFFER_SIZE, hopSize: RHYTHM_HOP_SIZE },
        });
        graph.source?.connect(graph.sampler);
        // The worklet emits silence; native playback remains on the direct branch.
        graph.sampler.connect(graph.context.destination);
        bindSampling(graph);
        resetSampling();
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.warn('Lyric rhythm analysis unavailable', error);
      }
    };
    const connect = () => {
      const audio = audioRef.current;
      if (graphRef.current && graphRef.current.audio !== audio) release();
      // Non-CORS fallback playback stays outside Web Audio, avoiding silent output.
      if (disposed || !audio || audio.crossOrigin !== 'anonymous' || !audio.currentSrc || audio.paused || !window.AudioContext || reduced.matches) return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      let graph = graphRef.current;
      // Pointer clicks on an already running player must not rebind its analysis.
      if (graph?.source && graph.sampler && graph.context.state === 'running') return;
      if (!graph) {
        try {
          graph = { audio, context: new AudioContext(), source: null, sampler: null, detector: null, version: 0, opening: false, analysisAttempted: false };
          graphRef.current = graph;
        } catch { return; }
      }
      if (graph.opening) { void graph.context.resume().catch(() => {}); return; }
      const active = graph;
      active.opening = true;
      // Never reroute native playback into a suspended context.
      void active.context.resume().then(() => {
        if (disposed || graphRef.current !== active || audioRef.current !== audio || active.context.state !== 'running') return;
        if (!active.source) {
          active.source = active.context.createMediaElementSource(audio);
          active.source.connect(active.context.destination);
        }
        void setupAnalysis(active);
      }).catch(() => { /* Native playback still works without Web Audio. */ })
        .finally(() => { active.opening = false; });
    };
    const onGesture = (event: Event) => { if (event.isTrusted) connect(); };
    const onMedia = (event: Event) => {
      if (event.target !== audioRef.current) return;
      if (event.type === 'playing') connect();
      resetSampling();
    };
    const onVisibility = () => { if (!document.hidden) connect(); resetSampling(); };
    const mediaEvents = ['playing', 'pause', 'ended', 'emptied', 'seeking', 'seeked', 'volumechange'];
    document.addEventListener('click', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    for (const name of mediaEvents) document.addEventListener(name, onMedia, true);
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onVisibility);
    // Also handles a mounted/replayed effect on an already playing element.
    if (graphRef.current) bindSampling(graphRef.current);
    connect();
    resetSampling();
    return () => {
      disposed = true;
      document.removeEventListener('click', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      for (const name of mediaEvents) document.removeEventListener(name, onMedia, true);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onVisibility);
      // Strict Mode replays effects on the same media element; keep its single source.
      disposalTimer.current = setTimeout(release, 0);
    };
  }, [audioRef, reader]);
}
