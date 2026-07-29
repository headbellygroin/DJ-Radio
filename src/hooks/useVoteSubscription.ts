import { useEffect, useRef } from 'react';

/**
 * Polls for vote updates on a station. Previously used a Postgres realtime
 * subscription, but the votes table SELECT policy was removed for security
 * (raw per-voter rows are no longer exposed). Realtime requires SELECT
 * permission to deliver events, so we poll the aggregated RPCs instead.
 *
 * The callback is kept in a ref so the interval does not tear down and
 * re-create when the callback identity changes.
 */
export function useVoteSubscription(
  stationId: string | undefined,
  onNewVote: () => void,
): void {
  const savedCallback = useRef(onNewVote);

  useEffect(() => {
    savedCallback.current = onNewVote;
  }, [onNewVote]);

  useEffect(() => {
    if (!stationId) return;

    const interval = setInterval(() => savedCallback.current(), 10000);
    return () => clearInterval(interval);
  }, [stationId]);
}
