import { useEffect, useState } from 'react';

// Counts down from durationMs starting at sinceTimestamp (a Date.now() value
// captured when the phase began). Cosmetic only — the server enforces the
// actual deadline; this just gives the player a sense of urgency.
export function useCountdown(sinceTimestamp, durationMs) {
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    if (!sinceTimestamp) return undefined;
    const tick = () => {
      const elapsed = Date.now() - sinceTimestamp;
      setRemainingMs(Math.max(0, durationMs - elapsed));
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [sinceTimestamp, durationMs]);

  return remainingMs;
}
