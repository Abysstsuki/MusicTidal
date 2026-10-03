export type RhythmFrame = { pulse: number; energy: number; bassWeight: number };
export type RhythmReader = () => RhythmFrame;
export const quietRhythm: RhythmReader = () => ({ pulse: 0, energy: 0, bassWeight: 0 });
export const RHYTHM_BUFFER_SIZE = 2048;
export const RHYTHM_HOP_SIZE = 512;
