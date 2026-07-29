/**
 * Pure shared helpers for player-related formatting and computation.
 * All functions are side-effect–free to facilitate testing and reuse.
 */

export function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Milliseconds until the next UTC hour boundary. */
export function msUntilNextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(now.getUTCHours() + 1);
  return next.getTime() - now.getTime();
}

/** Start of the current UTC hour as a Date object. */
export function currentHourStart(): Date {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return now;
}

/** UTC hour-key string (YYYY-MM-DD-HH). */
export function getHourKey(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
  ].join('-');
}

export function emailToSlug(email: string, uid: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  return `${base}-${uid.slice(0, 6)}`;
}
