// Tiny UI sound/haptic cues, synthesized with Web Audio rather than shipped
// as audio files — same primitives dsp/effectChains.js uses for the voice
// modifiers, just aimed at a short feedback blip instead of processing a
// recording.

let ctx = null;

function getContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

// Two quick ascending notes through a short gain envelope — a "ta-da" blip
// for landing a correct guess. Wrapped defensively: browsers can refuse to
// resume an AudioContext outside a user gesture, and this fires from an
// async socket event handler rather than directly inside a click, so a
// failure here should just be silent rather than surface an error banner.
export function playCorrectGuessChime() {
  try {
    const audioCtx = getContext();
    if (!audioCtx) return;
    audioCtx.resume?.();

    const now = audioCtx.currentTime;
    const notes = [660, 990];
    notes.forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Best-effort UI flourish — never worth surfacing to the player.
  }
}

export function triggerHaptic() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // Unsupported (e.g. iOS Safari) — no-op.
  }
}
