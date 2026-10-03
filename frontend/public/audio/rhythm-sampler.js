/* global AudioWorkletProcessor, currentTime, sampleRate, registerProcessor */

// A silent analysis branch: the player's audible signal never passes through here.
class RhythmSampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.bufferSize;
    this.hop = options.processorOptions.hopSize;
    this.ring = new Float32Array(this.size);
    this.write = 0;
    this.filled = 0;
    this.sinceFrame = 0;
    this.enabled = false;
    this.version = 0;
    this.port.onmessage = ({ data }) => {
      this.enabled = data.enabled;
      this.version = data.version;
      this.ring.fill(0);
      this.write = this.filled = this.sinceFrame = 0;
    };
  }

  process(inputs, outputs) {
    // Explicit silence prevents the tap from doubling playback volume.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!this.enabled || !input) return true;
    for (let i = 0; i < input.length; i++) {
      this.ring[this.write] = input[i];
      this.write = (this.write + 1) % this.size;
      this.filled = Math.min(this.size, this.filled + 1);
      this.sinceFrame++;
      if (this.filled === this.size && this.sinceFrame >= this.hop) {
        this.sinceFrame = 0;
        const buffer = new Float32Array(this.size);
        const tail = this.size - this.write;
        buffer.set(this.ring.subarray(this.write));
        buffer.set(this.ring.subarray(0, this.write), tail);
        this.port.postMessage({ buffer, time: currentTime + (i + 1) / sampleRate, version: this.version }, [buffer.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('music-tidal-rhythm', RhythmSampler);
