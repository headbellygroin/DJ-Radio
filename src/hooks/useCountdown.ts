import { useState, useEffect } from 'react';

/**
 * Generic countdown hook that calls `getRemaining()` every 1000 ms and
 * returns its result.  A stable reference for `getRemaining` (e.g. a
 * named function import) avoids unnecessary interval resets.
 */
export function useCountdown(getRemaining: () => number): number {
  const [ms, setMs] = useState(getRemaining);

  useEffect(() => {
    const id = setInterval(() => setMs(getRemaining()), 1000);
    return () => clearInterval(id);
  }, [getRemaining]);

  return ms;
}
