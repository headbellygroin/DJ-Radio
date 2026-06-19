/** UTC hour key used as the vote bucket identifier, e.g. "2026-06-19-14" */
export function getHourKey(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
  ].join('-');
}

/** Milliseconds until the next UTC hour boundary */
export function msUntilNextHour(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/** Start of the current UTC hour as a Date (used as hour_start in hourly_vote_result) */
export function currentHourStart(): Date {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return now;
}

/** Format a millisecond duration as M:SS */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
