// Each modifier describes a playbackRate (the cheap, real way to shift pitch
// without a phase vocoder/AudioWorklet: speeding up raises pitch, slowing
// down lowers it) plus a build() that wires a BiquadFilterNode/DelayNode/etc.
// chain onto an already-connected AudioBufferSourceNode. build() returns the
// last node in the chain; the caller connects that to the destination.
export const VOICE_MODIFIERS = {
  ROBOT: {
    label: 'Robot',
    emoji: '🤖',
    playbackRate: 1,
    build(ctx, source) {
      // Ring modulation: an oscillator driven straight into a GainNode's
      // audio-rate `gain` param multiplies the signal by a carrier wave —
      // the classic robotic/vocoder-ish buzz.
      const carrier = ctx.createOscillator();
      carrier.frequency.value = 45;

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0; // base value; the oscillator drives it from here
      carrier.connect(ringGain.gain);
      carrier.start(0);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1500;
      bandpass.Q.value = 0.8;

      source.connect(ringGain);
      ringGain.connect(bandpass);
      return bandpass;
    },
  },

  DEMON: {
    label: 'Demon',
    emoji: '😈',
    playbackRate: 0.65,
    build(ctx, source) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1100;

      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(18);
      shaper.oversample = '2x';

      source.connect(lowpass);
      lowpass.connect(shaper);
      return shaper;
    },
  },

  HIGH_PITCH: {
    label: 'High Pitch',
    emoji: '🎈',
    playbackRate: 1.5,
    build(ctx, source) {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 300;
      source.connect(highpass);
      return highpass;
    },
  },

  CHIPMUNK: {
    label: 'Chipmunk',
    emoji: '🐿️',
    playbackRate: 1.9,
    build(ctx, source) {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 400;
      source.connect(highpass);
      return highpass;
    },
  },

  ECHO: {
    label: 'Echo',
    emoji: '🔊',
    playbackRate: 1,
    build(ctx, source) {
      const dry = ctx.createGain();
      dry.gain.value = 1;

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.28;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.45;
      const wet = ctx.createGain();
      wet.gain.value = 0.6;

      source.connect(dry);
      source.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);

      const mix = ctx.createGain();
      dry.connect(mix);
      wet.connect(mix);
      return mix;
    },
  },
};

function distortionCurve(amount) {
  const samples = 44_100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
