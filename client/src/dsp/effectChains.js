// Each modifier describes a playbackRate (the cheap, real way to shift pitch
// without a phase vocoder/AudioWorklet: speeding up raises pitch, slowing
// down lowers it) plus a build() that wires a BiquadFilterNode/DelayNode/etc.
// chain onto an already-connected AudioBufferSourceNode. build() returns the
// last node in the chain; the caller connects that to the destination.
export const VOICE_MODIFIERS = {
  NONE: {
    label: 'No Effect',
    playbackRate: 1,
    build(ctx, source) {
      return source;
    },
  },

  ROBOT: {
    label: 'Robot',
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

  // Slow LFO wobbling the lowpass cutoff underneath heavy muffling — the
  // only modifier that varies over time rather than just recoloring the
  // signal statically, which is what actually reads as "underwater" instead
  // of just "muffled".
  UNDERWATER: {
    label: 'Underwater',
    playbackRate: 0.92,
    build(ctx, source) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 500;
      lowpass.Q.value = 3;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220; // wobble depth around the base cutoff
      lfo.connect(lfoGain);
      lfoGain.connect(lowpass.frequency);
      lfo.start(0);

      source.connect(lowpass);
      return lowpass;
    },
  },

  // Genuinely mangles the signal rather than just recoloring it — narrow
  // telephone-bandwidth filtering plus heavy waveshaper grit. Used by
  // TELEPHONE mode, where degradation is meant to compound hop over hop.
  DISTORT: {
    label: 'Distort',
    playbackRate: 1,
    build(ctx, source) {
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1200;
      bandpass.Q.value = 0.6;

      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(45);
      shaper.oversample = '4x';

      const crackle = ctx.createBiquadFilter();
      crackle.type = 'highshelf';
      crackle.frequency.value = 2500;
      crackle.gain.value = 8;

      source.connect(bandpass);
      bandpass.connect(shaper);
      shaper.connect(crackle);
      return crackle;
    },
  },

  // Flanger: a short delay (a few ms, not the tens-to-hundreds ECHO uses)
  // swept by a slow LFO, mixed with the dry signal. The sweeping comb
  // filtering it produces (peaks/nulls sliding across the spectrum) is what
  // reads as "otherworldly" rather than just delayed.
  ALIEN: {
    label: 'Alien',
    playbackRate: 1.05,
    build(ctx, source) {
      const dry = ctx.createGain();
      dry.gain.value = 0.6;

      const delay = ctx.createDelay(0.02);
      delay.delayTime.value = 0.006;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.004; // sweeps delayTime roughly between 2ms and 10ms
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start(0);

      const wet = ctx.createGain();
      wet.gain.value = 0.7;

      source.connect(dry);
      source.connect(delay);
      delay.connect(wet);

      const mix = ctx.createGain();
      dry.connect(mix);
      wet.connect(mix);
      return mix;
    },
  },

  // Thins the voice down to its high end and layers a quiet filtered-noise
  // bed underneath — the noise is what actually sells "breath" rather than
  // just "quiet and tinny".
  WHISPER: {
    label: 'Whisper',
    playbackRate: 1,
    build(ctx, source) {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 2000;

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.5;

      source.connect(highpass);
      highpass.connect(voiceGain);

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(ctx, source.buffer.duration);
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 3000;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.06;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseSource.start(0);

      const mix = ctx.createGain();
      voiceGain.connect(mix);
      noiseGain.connect(mix);
      return mix;
    },
  },

  // Walkie-talkie: a mid bandpass plus light grit, with a square-wave LFO
  // gating the output gain for the intermittent squelch/cutout radios have —
  // distinct from DISTORT's constant static crackle.
  RADIO: {
    label: 'Radio',
    playbackRate: 1,
    build(ctx, source) {
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1800;
      bandpass.Q.value = 1.4;

      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(10);
      shaper.oversample = '2x';

      const squelch = ctx.createGain();
      squelch.gain.value = 0.85; // base level; the LFO swings gain around this

      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain);
      lfoGain.connect(squelch.gain);
      lfo.start(0);

      source.connect(bandpass);
      bandpass.connect(shaper);
      shaper.connect(squelch);
      return squelch;
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

function createNoiseBuffer(ctx, durationSeconds) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.ceil(durationSeconds * sampleRate));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Wire-format modifier keys are either a single VOICE_MODIFIERS key, or up to
// MAX_MODIFIERS_PER_COMBO of them joined with this separator (e.g.
// "ROBOT+ECHO") when the actor stacks two effects.
export const MODIFIER_COMBO_SEPARATOR = '+';
export const MAX_MODIFIERS_PER_COMBO = 2;

// Resolves a wire-format modifier key into a single { label, playbackRate,
// build() } shape processRecording can render directly. A single key
// resolves to its own entry unchanged — existing single-effect recordings
// are unaffected. A combo's first (primary) effect owns playbackRate
// (stacking two rate changes would compound into something extreme); both
// build() chains apply in sequence so the secondary effect still colors the
// tone. Returns undefined for an unknown key/combo.
export function resolveModifier(comboKey) {
  const parts = String(comboKey).split(MODIFIER_COMBO_SEPARATOR);
  if (parts.length === 1) return VOICE_MODIFIERS[parts[0]];

  const modifiers = parts.map((key) => VOICE_MODIFIERS[key]);
  if (modifiers.some((m) => !m)) return undefined;

  const [primary, secondary] = modifiers;
  return {
    label: `${primary.label} + ${secondary.label}`,
    playbackRate: primary.playbackRate,
    build(ctx, source) {
      return secondary.build(ctx, primary.build(ctx, source));
    },
  };
}
