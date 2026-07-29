/**
 * Shared vote data logic: tally helper, localStorage token helpers,
 * and database fetch/submit functions.
 */
import { supabase } from './supabase';
import type { VoteTally } from './types';
export function tallyVotes(
  rows: Array<{ value: string }>,
): VoteTally[] {
  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.value] = (map[r.value] || 0) + 1;
  }
  return Object.entries(map)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}
const VOTER_TOKEN_KEY = 'radiodj_voter_token';

export function getVoterToken(): string {
  let token = localStorage.getItem(VOTER_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(VOTER_TOKEN_KEY, token);
  }
  return token;
}

export function getVotedKey(stationId: string, hourKey: string): string {
  return `radiodj_voted_${stationId}_${hourKey}`;
}
export async function fetchCurrentWinner(stationId: string): Promise<string | null> {
  const { data } = await supabase.rpc('get_current_winner', { p_station_id: stationId });
  return (data as string | null) ?? null;
}
export async function fetchVoteTallies(
  stationId: string,
  hourKey: string,
): Promise<VoteTally[]> {
  const { data } = await supabase.rpc('get_genre_tallies', {
    p_station_id: stationId,
    p_hour_key: hourKey,
  });
  return (data as VoteTally[] | null) ?? [];
}
export async function fetchSongRequests(
  stationId: string,
  hourKey: string,
): Promise<string[]> {
  const { data } = await supabase.rpc('get_song_requests', {
    p_station_id: stationId,
    p_hour_key: hourKey,
  });
  return ((data as Array<{ value: string }> | null) ?? []).map((r) => r.value);
}
export async function submitGenreVote(
  stationId: string,
  genre: string,
  durationMinutes: number,
  voterToken: string,
  hourKey: string,
): Promise<{ recorded: boolean }> {
  const { data, error } = await supabase.rpc('submit_vote', {
    p_station_id: stationId,
    p_vote_type: 'genre',
    p_value: genre,
    p_duration_minutes: durationMinutes,
    p_voter_token: voterToken,
    p_hour_key: hourKey,
  });
  return { recorded: !error && (data as boolean | null) === true };
}
export async function submitSongRequest(
  stationId: string,
  song: string,
  voterToken: string,
  hourKey: string,
): Promise<{ recorded: boolean }> {
  const { data, error } = await supabase.rpc('submit_vote', {
    p_station_id: stationId,
    p_vote_type: 'song',
    p_value: song,
    p_duration_minutes: null,
    p_voter_token: voterToken,
    p_hour_key: hourKey,
  });
  return { recorded: !error && (data as boolean | null) === true };
}
