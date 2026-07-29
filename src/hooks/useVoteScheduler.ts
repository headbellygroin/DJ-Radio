import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  checkServer,
  fetchAvailableGenres,
  loadTracksForSource,
} from '../lib/localServerClient';
import { msUntilNextHour, currentHourStart } from '../lib/playerUtils';
import { fetchVoteTallies } from '../lib/voteService';
import type { PlaySource, VoteStatus, Station, PlayOrder } from '../lib/types';
import type { PlaybackController, PendingSwitch } from './usePlaybackController';

export interface VoteSchedulerAPI {
  playSource: PlaySource;
  availableGenres: string[];
  genreFolder: string | null;
  serverStatus: 'unknown' | 'ok' | 'error';
  countdownMs: number;
  voteStatus: VoteStatus;
  lastVoteResult: string | null;
  pendingGenre: string | null;
  hasPendingAction: boolean;

  loadFromServer: () => Promise<void>;
  djForceGenre: (genre: string | null) => void;
  djSwitchNow: (genre: string | null) => Promise<void>;
  setPendingGenre: React.Dispatch<React.SetStateAction<string | null>>;
  setHasPendingAction: React.Dispatch<React.SetStateAction<boolean>>;
}

interface UseVoteSchedulerOptions {
  station: Station | null;
  playOrder: PlayOrder;
  playback: PlaybackController;
}

export function useVoteScheduler({
  station,
  playOrder,
  playback,
}: UseVoteSchedulerOptions): VoteSchedulerAPI {
  const [playSource, setPlaySource] = useState<PlaySource>('master');
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [genreFolder, setGenreFolder] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [countdownMs, setCountdownMs] = useState(msUntilNextHour());
  const [voteStatus, setVoteStatus] = useState<VoteStatus>('idle');
  const [lastVoteResult, setLastVoteResult] = useState<string | null>(null);
  const [pendingGenre, setPendingGenre] = useState<string | null>(null);
  const [hasPendingAction, setHasPendingAction] = useState(false);

  const hourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voteStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyGenreSwitch = useCallback(
    async (genre: string | null) => {
      const source: PlaySource =
        genre && availableGenres.includes(genre) ? genre : 'master';
      setVoteStatus('fetching');

      const result = await loadTracksForSource(source, playOrder);
      if (!result || result.tracks.length === 0) {
        const fallback = await loadTracksForSource('master', playOrder);
        if (fallback) {
          playback.replaceQueue(fallback.tracks, fallback.images, 0);
          setPlaySource('master');
          setVoteStatus('fallback');
          playback.playTrack(0, fallback.tracks);
        }
        return;
      }

      playback.replaceQueue(result.tracks, result.images, 0);
      setPlaySource(source);
      setVoteStatus(source === 'master' ? 'fallback' : 'switched');
      playback.playTrack(0, result.tracks);
    },
    [availableGenres, playOrder, playback],
  );

  const loadFromServer = useCallback(async () => {
    playback.clearActivePlayback();

    const status = await checkServer();
    if (!status.ok) {
      setServerStatus('error');
      return;
    }
    setServerStatus(status.ready ? 'ok' : 'error');
    setGenreFolder(status.genreFolder);

    const genres = await fetchAvailableGenres();
    setAvailableGenres(genres);

    if (station && genres.length > 0) {
      await supabase
        .from('stations')
        .update({ genres, updated_at: new Date().toISOString() })
        .eq('id', station.id);
    }

    const result = await loadTracksForSource('master', playOrder);
    if (!result) {
      setServerStatus('error');
      return;
    }

    playback.replaceQueue(result.tracks, result.images, -1);
    playback.setMode('server');
    setPlaySource('master');
  }, [playback, station, playOrder]);

  const tallyAndSwitch = useCallback(async () => {
    if (!station) return;

    setVoteStatus('fetching');
    const prevDate = new Date(currentHourStart().getTime() - 3600000);
    const hourKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDate.getUTCDate()).padStart(2, '0')}-${String(prevDate.getUTCHours()).padStart(2, '0')}`;
    const hourStart = prevDate.toISOString();

    const tallies = await fetchVoteTallies(station.id, hourKey);
    const winner = tallies[0]?.genre ?? null;
    const genreWinner = winner && availableGenres.includes(winner) ? winner : null;

    await supabase.from('hourly_vote_result').insert({ hour_start: hourStart, genre: genreWinner, station_id: station.id }).single();

    setLastVoteResult(genreWinner);
    setPendingGenre(genreWinner);
    setHasPendingAction(true);
    playback.pendingSwitchRef.current = { genre: genreWinner };
  }, [station, availableGenres, playback.pendingSwitchRef]);

  const scheduleHourlyCheck = useCallback(() => {
    if (hourTimerRef.current) clearTimeout(hourTimerRef.current);
    const ms = msUntilNextHour();
    hourTimerRef.current = setTimeout(async () => {
      if (playback.mode === 'server') {
        await tallyAndSwitch();
      }
      scheduleHourlyCheck();
    }, ms);
  }, [playback.mode, tallyAndSwitch]);

  useEffect(() => {
    if (playback.mode === 'server') scheduleHourlyCheck();
    return () => {
      if (hourTimerRef.current) clearTimeout(hourTimerRef.current);
    };
  }, [playback.mode, scheduleHourlyCheck]);

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdownMs(msUntilNextHour()), 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (voteStatusTimeoutRef.current) clearTimeout(voteStatusTimeoutRef.current);
    if (voteStatus === 'switched' || voteStatus === 'fallback') {
      voteStatusTimeoutRef.current = setTimeout(() => setVoteStatus('idle'), 8000);
    }
    return () => {
      if (voteStatusTimeoutRef.current) clearTimeout(voteStatusTimeoutRef.current);
    };
  }, [voteStatus]);

  const djForceGenre = useCallback(
    (genre: string | null) => {
      setPendingGenre(genre);
      setHasPendingAction(true);
      playback.pendingSwitchRef.current = { genre } satisfies PendingSwitch;
    },
    [playback.pendingSwitchRef],
  );

  const djSwitchNow = useCallback(
    async (genre: string | null) => {
      setHasPendingAction(false);
      setPendingGenre(null);
      playback.pendingSwitchRef.current = null;
      await applyGenreSwitch(genre);
    },
    [applyGenreSwitch, playback.pendingSwitchRef],
  );

  return {
    playSource,
    availableGenres,
    genreFolder,
    serverStatus,
    countdownMs,
    voteStatus,
    lastVoteResult,
    pendingGenre,
    hasPendingAction,

    loadFromServer,
    djForceGenre,
    djSwitchNow,
    setPendingGenre,
    setHasPendingAction,
  };
}
