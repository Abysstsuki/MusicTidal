import Meyda from 'meyda';
import { RHYTHM_BUFFER_SIZE, RHYTHM_HOP_SIZE, quietRhythm, type RhythmFrame } from '@/lib/audio-rhythm';
import rhythmConfig from '@/lib/rhythm-config.json';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Sample = { time: number; bass: number; rms: number };
type PendingPeak = { start: number; energy: number; rawEnergy: number; rawRms: number; time: number; fallFrames: number };

// Formal tuning v1: the demo's low-band RMS rise detector, streamed with a
// bounded lookahead for its centred smoothing window. Pulses start when a peak
// is confirmed, since live playback cannot backfill the earlier peak time.
export function createRhythmDetector(sampleRate: number, onBeat?: (timestamp: number) => void) {
  const config = rhythmConfig;
  const debug = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'
    && new URLSearchParams(window.location.search).has('lyricsDebug');
  Meyda.bufferSize = RHYTHM_BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.windowingFunction = 'hanning';
  const binHz = sampleRate / RHYTHM_BUFFER_SIZE;
  const bands = config.bands.map(band => ({
    first: Math.max(1, Math.ceil(band.low / binHz)),
    end: Math.min(RHYTHM_BUFFER_SIZE / 2, Math.ceil(band.high / binHz)),
  }));
  const step = RHYTHM_HOP_SIZE / sampleRate;
  const radius = Math.round(config.attackSmoothing / 1000 / step / 2);
  const lag = Math.max(1, Math.round(config.attackWindow / 1000 / step));
  const resetFrames = Math.max(1, Math.ceil(config.attackReset / 1000 / step));
  const confirmFrames = Math.max(1, Math.ceil(config.attackConfirm / 1000 / step));
  const peakFrames = Math.max(confirmFrames + 1, Math.ceil(config.attackPeakWindow / 1000 / step));
  const noiseAdapt = 1 - Math.exp(-step / (config.attackAdaptation / 1000));
  const visualAdapt = 1 - Math.exp(-step * 2);
  const samples: Sample[] = [], history: number[] = [];
  let smoothingSum = 0, sampleCount = 0, firstSample = 0;
  let noise = 0, ready = true, quietFrames = 0, pending: PendingPeak | null = null;
  let energy = 0, bassWeight = 0;
  let lastPeak = -Infinity, lastBeat = -Infinity, lastFrame = -Infinity;
  let debugDeltaPeak = 0, debugRmsPeak = 0;
  const reset = () => {
    samples.length = history.length = 0;
    smoothingSum = sampleCount = firstSample = noise = quietFrames = energy = bassWeight = 0;
    ready = true; pending = null;
    lastPeak = lastBeat = lastFrame = -Infinity;
    debugDeltaPeak = debugRmsPeak = 0;
  };
  const ingest = (signal: Float32Array, timestamp: number) => {
    if (timestamp <= lastFrame) return;
    if (timestamp - lastFrame > 0.2) reset();
    const features = Meyda.extract(['amplitudeSpectrum', 'rms'], signal);
    const spectrum = features?.amplitudeSpectrum, rms = features?.rms;
    if (!spectrum || rms === undefined) return;
    let lowPower = 0, totalPower = 0;
    for (const [index, band] of bands.entries()) {
      let power = 0;
      for (let i = band.first; i < band.end; i++) power += spectrum[i] * spectrum[i];
      totalPower += power;
      if (index === 0) lowPower = power;
    }
    const bass = Math.sqrt(2 * lowPower) / (RHYTHM_BUFFER_SIZE * Math.sqrt(3 / 8));
    energy += (clamp(rms / 0.18) - energy) * (1 - Math.exp(-step * 8));
    bassWeight += (lowPower / Math.max(totalPower, 1e-8) - bassWeight) * visualAdapt;
    lastFrame = timestamp;
    samples.push({ time: timestamp, bass, rms });
    smoothingSum += bass;
    const index = sampleCount++ - radius;
    if (index < 0) return;
    // Keep the same centred window and Float32 envelope as the offline demo,
    // delaying processing until the required following samples have arrived.
    while (firstSample < Math.max(0, index - radius)) {
      smoothingSum -= samples.shift()!.bass;
      firstSample++;
    }
    const sample = samples[index - firstSample];
    const smoothed = Math.fround(smoothingSum / samples.length);
    history.push(smoothed);
    const reference = history[Math.max(0, history.length - lag - 1)];
    if (history.length > lag + 1) history.shift();
    const delta = Math.max(0, smoothed - reference);
    const ratio = delta / Math.max(reference, config.noiseRms, 1e-5);
    const limit = Math.max(config.attackDelta, noise * config.attackNoiseMultiplier);
    if (debug) {
      debugDeltaPeak = Math.max(debugDeltaPeak, delta);
      debugRmsPeak = Math.max(debugRmsPeak, sample.rms);
      if (index % Math.ceil(1 / step) === 0) {
        console.debug('[rhythm-detection]', JSON.stringify({ frame: index, sampleRate,
          rmsPeak: +debugRmsPeak.toFixed(5), deltaPeak: +debugDeltaPeak.toFixed(5),
          threshold: +limit.toFixed(5), ratio: +ratio.toFixed(3), ready, pending: !!pending }));
        debugDeltaPeak = debugRmsPeak = 0;
      }
    }
    if (!ready) {
      quietFrames = delta <= limit * config.attackResetRatio ? quietFrames + 1 : 0;
      if (quietFrames >= resetFrames) { ready = true; quietFrames = 0; }
    }
    const attack = index > lag + 2 && sample.rms > config.noiseRms
      && delta >= limit && ratio >= config.attackRatio && ready;
    if (attack) {
      ready = false; quietFrames = 0;
      if (!pending) pending = { start: index, energy: smoothed, rawEnergy: sample.bass,
        rawRms: sample.rms, time: sample.time, fallFrames: 0 };
    }
    if (pending) {
      if (smoothed > pending.energy) { pending.energy = smoothed; pending.fallFrames = 0; }
      if (sample.bass > pending.rawEnergy) {
        pending.rawEnergy = sample.bass; pending.rawRms = sample.rms; pending.time = sample.time;
      }
      pending.fallFrames = smoothed <= pending.energy * (1 - config.attackFallRatio) ? pending.fallFrames + 1 : 0;
      const confirmed = pending.fallFrames >= confirmFrames;
      if (confirmed || index - pending.start >= peakFrames) {
        if (confirmed && pending.rawRms > config.noiseRms && pending.time - lastPeak >= config.interval) {
          lastPeak = pending.time;
          // Start a full-strength pulse now instead of decaying it from the
          // earlier peak. The offline-only timingOffset is intentionally unused.
          lastBeat = timestamp;
          onBeat?.(timestamp);
        }
        pending = null;
      }
    }
    if (!pending && (delta < limit || ratio < config.attackRatio)) {
      noise += (Math.min(delta, limit) - noise) * noiseAdapt;
    }
  };
  const read = (timestamp: number): RhythmFrame => {
    if (timestamp - lastFrame > 0.2) return quietRhythm();
    const pulse = Number.isFinite(lastBeat)
      ? Math.exp(-Math.max(0, timestamp - lastBeat - config.hold) * config.release)
      : 0;
    return { pulse, energy, bassWeight };
  };
  return { ingest, read, reset };
}
