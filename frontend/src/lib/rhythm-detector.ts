import Meyda from 'meyda';
import { RHYTHM_BUFFER_SIZE, RHYTHM_HOP_SIZE, quietRhythm, type RhythmFrame } from '@/lib/audio-rhythm';

const BANDS = [
  { low: 30, high: 250, weight: 1 },
  { low: 250, high: 2000, weight: 0.9 },
  { low: 2000, high: 6500, weight: 0.55 },
];
const NOISE_RMS = 0.008;
const MIN_ONSET_INTERVAL = 0.11;
const HOLD_SECONDS = 0.045;
const RELEASE_RATE = 10;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Multi-band onset detection. Every accepted onset has the same pulse strength;
// no kick-only confirmation, intensity grading or stronger-onset priority.
export function createRhythmDetector(sampleRate: number) {
  Meyda.bufferSize = RHYTHM_BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;
  Meyda.windowingFunction = 'hanning';
  const previous = new Float32Array(RHYTHM_BUFFER_SIZE / 2);
  const binHz = sampleRate / RHYTHM_BUFFER_SIZE;
  const bands = BANDS.map(band => ({
    ...band,
    first: Math.max(1, Math.ceil(band.low / binHz)),
    end: Math.min(previous.length, Math.ceil(band.high / binHz)),
  }));
  const step = RHYTHM_HOP_SIZE / sampleRate;
  const adapt = 1 - Math.exp(-step * 2);
  let mean = 0, variance = 0, averageRms = 0, previousRms = 0, frames = 0;
  let energy = 0, bassWeight = 0;
  let lastBeat = -Infinity, lastFrame = -Infinity;
  const envelope = (timestamp: number) => Number.isFinite(lastBeat)
    ? Math.exp(-Math.max(0, timestamp - lastBeat - HOLD_SECONDS) * RELEASE_RATE)
    : 0;
  const reset = () => {
    previous.fill(0);
    mean = variance = averageRms = previousRms = frames = energy = bassWeight = 0;
    lastBeat = lastFrame = -Infinity;
  };
  const ingest = (signal: Float32Array, timestamp: number) => {
    if (timestamp <= lastFrame) return;
    if (timestamp - lastFrame > 0.2) reset();
    const features = Meyda.extract(['amplitudeSpectrum', 'rms'], signal);
    const spectrum = features?.amplitudeSpectrum;
    const rms = features?.rms;
    if (!spectrum || rms === undefined) return;
    let onset = 0, lowPower = 0, totalPower = 0;
    for (const [index, band] of bands.entries()) {
      let power = 0, positiveFlux = 0, magnitudeSum = 0;
      for (let i = band.first; i < band.end; i++) {
        const magnitude = spectrum[i];
        power += magnitude * magnitude;
        positiveFlux += Math.max(0, magnitude - previous[i]);
        magnitudeSum += magnitude;
        previous[i] = magnitude;
      }
      totalPower += power;
      if (index === 0) lowPower = power;
      const bandRms = Math.sqrt(2 * power) / (RHYTHM_BUFFER_SIZE * Math.sqrt(3 / 8));
      // Weak spectral fluctuations do not trigger just because their relative
      // change is large. Higher-band noise also receives less weight.
      if (bandRms > 0.003) {
        onset = Math.max(onset, positiveFlux / Math.max(magnitudeSum, 1e-5) * band.weight);
      }
    }
    const threshold = Math.max(0.12, mean * 1.45 + Math.sqrt(variance) * 0.8 + 0.03);
    const rise = (rms - previousRms) / Math.max(averageRms, NOISE_RMS);
    const hasAttack = onset > threshold || (rise > 0.25 && onset > 0.085);
    if (frames > 3 && rms > NOISE_RMS && hasAttack && timestamp - lastBeat >= MIN_ONSET_INTERVAL) {
      // Any valid onset restarts the same envelope, regardless of intensity.
      lastBeat = timestamp;
    }
    const difference = onset - mean;
    mean += difference * adapt;
    variance += (difference * difference - variance) * adapt;
    averageRms += (rms - averageRms) * adapt;
    previousRms = rms;
    energy += (clamp(rms / 0.18) - energy) * (1 - Math.exp(-step * 8));
    bassWeight += (lowPower / Math.max(totalPower, 1e-8) - bassWeight) * adapt;
    lastFrame = timestamp;
    frames++;
  };
  const read = (timestamp: number): RhythmFrame => {
    if (timestamp - lastFrame > 0.2) return quietRhythm();
    return { pulse: envelope(timestamp), energy, bassWeight };
  };
  return { ingest, read, reset };
}
