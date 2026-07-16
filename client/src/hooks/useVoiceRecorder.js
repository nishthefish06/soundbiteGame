import { useCallback, useEffect, useRef, useState } from 'react';
import { processRecording } from '../dsp/processRecording.js';
import { RECORDING_DURATION_MS } from '../gameConstants.js';

export const MAX_RECORDING_MS = RECORDING_DURATION_MS;

// getUserMedia rejects with a DOMException whose `name` identifies the
// failure; its `message` is browser-specific and not fit to show a player.
function describeMicError(err) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone access was denied. Allow it in your browser’s site settings, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone found. Connect one and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your microphone is in use by another app. Close it and try again.';
    default:
      return err.message || 'Could not access the microphone. Please try again.';
  }
}

// Records up to MAX_RECORDING_MS of mic audio via MediaRecorder, then runs
// the dry Blob through the chosen voice modifier's Web Audio graph and
// exposes the processed WAV Blob for local preview or sending over the wire.
export function useVoiceRecorder() {
  const [status, setStatus] = useState('idle'); // idle | recording | processing | ready | error
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedBlob, setProcessedBlob] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(0);
  const modifierRef = useRef(null);
  const previewUrlRef = useRef(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const releasePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const start = useCallback(
    async (modifierKey) => {
      setError(null);
      setProcessedBlob(null);
      releasePreviewUrl();
      setPreviewUrl(null);
      modifierRef.current = modifierKey;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
          releaseStream();
          setStatus('processing');
          try {
            const dryBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            const wavBlob = await processRecording(dryBlob, modifierRef.current);
            const url = URL.createObjectURL(wavBlob);
            previewUrlRef.current = url;
            setProcessedBlob(wavBlob);
            setPreviewUrl(url);
            setStatus('ready');
          } catch (err) {
            setStatus('error');
            setError(err.message || 'Could not process the recording. Please try again.');
          }
        };

        recorder.start();
        setStatus('recording');
        setElapsedMs(0);
        startedAtRef.current = Date.now();
        intervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startedAtRef.current;
          setElapsedMs(elapsed);
          if (elapsed >= MAX_RECORDING_MS) stop();
        }, 100);
      } catch (err) {
        setStatus('error');
        setError(describeMicError(err));
      }
    },
    [releaseStream, releasePreviewUrl, stop],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setElapsedMs(0);
    setProcessedBlob(null);
    releasePreviewUrl();
    setPreviewUrl(null);
  }, [releasePreviewUrl]);

  useEffect(
    () => () => {
      clearInterval(intervalRef.current);
      releaseStream();
      releasePreviewUrl();
    },
    [releaseStream, releasePreviewUrl],
  );

  return {
    status,
    error,
    elapsedMs,
    maxMs: MAX_RECORDING_MS,
    processedBlob,
    previewUrl,
    start,
    stop,
    reset,
  };
}
