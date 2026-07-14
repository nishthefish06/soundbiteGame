import { VOICE_MODIFIERS } from './effectChains.js';
import { encodeWavBlob } from './wavEncoder.js';

// Decodes the dry MediaRecorder Blob, runs it through the selected voice
// modifier's Web Audio graph on an OfflineAudioContext (so it renders as
// fast as possible rather than in realtime), and encodes the result as WAV.
export async function processRecording(dryBlob, modifierKey) {
  const modifier = VOICE_MODIFIERS[modifierKey];
  if (!modifier) throw new Error(`Unknown voice modifier: ${modifierKey}`);

  const arrayBuffer = await dryBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let inputBuffer;
  try {
    inputBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  const playbackRate = modifier.playbackRate ?? 1;
  const outputFrames = Math.max(1, Math.ceil(inputBuffer.length / playbackRate));

  const offlineCtx = new OfflineAudioContext(
    inputBuffer.numberOfChannels,
    outputFrames,
    inputBuffer.sampleRate,
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;
  source.playbackRate.value = playbackRate;

  const chainEnd = modifier.build(offlineCtx, source);
  chainEnd.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  return encodeWavBlob(renderedBuffer);
}
