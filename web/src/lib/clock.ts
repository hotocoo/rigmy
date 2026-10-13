'use client';

import { useEffect, useState } from 'react';

/** Open/closed labels and "in N days" copy change at most once a minute, the finest unit they show. */
export const CLOCK_TICK_MS = 60_000;

/**
 * The current time, re-read every `tickMs` (default a minute). Pass `null` to read it once per mount, for screens whose
 * derived values (e.g. checkout delivery slots) must not shift while the user fills them in.
 */
export function useNow(tickMs: number | null = CLOCK_TICK_MS) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs == null) return;
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}
