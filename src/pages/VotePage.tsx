import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CheckCircle, Music2, Mic2, Send, AlertCircle } from 'lucide-react';
import {
  getHourKey,
  formatCountdown,
  msUntilNextHour,
} from '../lib/playerUtils';
import {
  getVoterToken,
  getVotedKey,
  fetchCurrentWinner,
  fetchVoteTallies,
  submitGenreVote,
  submitSongRequest,
  fetchPublicStation,
} from '../lib/voteService';
import { useCountdown } from '../hooks/useCountdown';
import { useVoteSubscription } from '../hooks/useVoteSubscription';
import type { Station, VoteTally } from '../lib/types';

import PageShell from '../components/ui/PageShell';
import Spinner from '../components/ui/Spinner';
import SegmentedControl from '../components/ui/SegmentedControl';
import LoadingButton from '../components/ui/LoadingButton';
import Brand from '../components/ui/Brand';

const DURATIONS = [
  { label: '1 hour',  value: 60  },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
];

export default function VotePage() {
  const { slug } = useParams<{ slug?: string }>();

  const [station, setStation]           = useState<Station | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [voteTallies, setVoteTallies]   = useState<VoteTally[]>([]);
  const [currentWinner, setCurrentWinner] = useState<string | null>(null);

  const [selectedGenre, setSelectedGenre]     = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [submitting, setSubmitting]     = useState(false);
  const [voted, setVoted]               = useState(false);
  const [myVote, setMyVote]             = useState<string | null>(null);
  const [voteError, setVoteError]       = useState<string | null>(null);

  const [songRequest, setSongRequest]   = useState('');
  const [songSubmitting, setSongSubmitting] = useState(false);
  const [songSent, setSongSent]         = useState(false);
  const [songError, setSongError]       = useState<string | null>(null);

  const [tab, setTab]                   = useState<'genre' | 'song'>('genre');

  const countdownMs    = useCountdown(msUntilNextHour);
  const hourKey        = getHourKey();
  const prevHourKeyRef = useRef(hourKey);

  const refreshTallies = useCallback(async () => {
    if (!station) return;
    setVoteTallies(await fetchVoteTallies(station.id, getHourKey()));
  }, [station]);

  useVoteSubscription(station?.id, refreshTallies);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);

      const data = await fetchPublicStation(slug ?? null);
      if (cancelled) return;
      if (!data) {
        setError(slug ? `Station "${slug}" not found.` : 'No station found.');
      } else {
        setStation(data);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!station) return;
    fetchCurrentWinner(station.id).then(setCurrentWinner);
    refreshTallies();
  }, [station, refreshTallies]);

  useEffect(() => {
    if (!station) return;
    const stored = localStorage.getItem(getVotedKey(station.id, hourKey));
    if (stored) {
      setVoted(true);
      setMyVote(stored);
    } else {
      setVoted(false);
      setMyVote(null);
    }
    setSelectedGenre(null);
  }, [station?.id, hourKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!station) return;
    if (hourKey !== prevHourKeyRef.current) {
      prevHourKeyRef.current = hourKey;
      setVoted(false);
      setMyVote(null);
      setSelectedGenre(null);
      fetchCurrentWinner(station.id).then(setCurrentWinner);
    }
  }, [hourKey, station]);

  const handleSubmitVote = async () => {
    if (!station || !selectedGenre || voted) return;
    setSubmitting(true);
    setVoteError(null);
    const hk  = getHourKey();
    const tok = getVoterToken();
    const result = await submitGenreVote(station.id, selectedGenre, selectedDuration, tok, hk);
    setSubmitting(false);
    if (result.recorded) {
      localStorage.setItem(getVotedKey(station.id, hk), selectedGenre);
      setVoted(true);
      setMyVote(selectedGenre);
      refreshTallies();
    } else {
      setVoteError(result.error ?? 'Vote could not be recorded. Please try again.');
    }
  };

  const handleSubmitSong = async () => {
    if (!station || !songRequest.trim()) return;
    setSongSubmitting(true);
    setSongError(null);
    const hk  = getHourKey();
    const tok = getVoterToken();
    const result = await submitSongRequest(station.id, songRequest.trim(), tok, hk);
    setSongSubmitting(false);
    if (result.recorded) {
      setSongSent(true);
      setSongRequest('');
      setTimeout(() => setSongSent(false), 4000);
    } else {
      setSongError(result.error ?? 'Request could not be sent. Please try again.');
    }
  };

  const totalVotes = voteTallies.reduce((s, v) => s + v.count, 0);
  const winnerName = currentWinner ?? 'Master';

  if (loading) {
    return (
      <PageShell className="flex items-center justify-center">
        <Spinner />
      </PageShell>
    );
  }

  if (error || !station) {
    return (
      <PageShell className="flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-white/50">{error ?? 'Station not found.'}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <Brand subtitle={station.name} />

        <div className="flex items-center gap-2 text-xs text-white/30">
          <Clock size={12} />
          <span>Next vote in {formatCountdown(countdownMs)}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ml-1" />
          <span className="text-red-400 text-[10px] font-medium">LIVE</span>
        </div>
      </header>

      <div className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
        {/* Current genre playing (always visible; shows Master as default) */}
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl">
          <Music2 size={14} className="text-white/30 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-white/30">Currently playing</p>
            <p className="text-sm font-medium truncate">{winnerName}</p>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-xl font-bold mb-1">Vote for the next hour</h1>
        <p className="text-sm text-white/40 mb-6">
          The winning genre plays from {formatCountdown(countdownMs)} from now.
          {totalVotes > 0 && ` ${totalVotes} vote${totalVotes !== 1 ? 's' : ''} cast so far.`}
        </p>

        {/* Tab switcher */}
        <SegmentedControl
          options={[
            { value: 'genre', label: 'Vote by genre' },
            { value: 'song',  label: 'Request a song' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'genre' && (
          <div className="mt-6">
            {station.genres.length === 0 ? (
              <div className="text-center py-10 text-white/25">
                <Music2 size={32} className="mx-auto mb-3 opacity-50" />
                <p>No genres configured for this station yet.</p>
              </div>
            ) : (
              <>
                {/* Already voted notice */}
                {voted && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl mb-4 text-sm">
                    <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
                    <span className="text-green-300">
                      You voted for <strong>{myVote}</strong> this hour. Thanks!
                    </span>
                  </div>
                )}

                {/* Genre grid */}
                <div className="space-y-2 mb-6">
                  {station.genres.map((genre) => {
                    const tally  = voteTallies.find((v) => v.genre === genre);
                    const count  = tally?.count ?? 0;
                    const pct    = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
                    const isTop  = voteTallies[0]?.genre === genre && totalVotes > 0;
                    const isMine = myVote === genre;

                    return (
                      <button
                        key={genre}
                        onClick={() => !voted && setSelectedGenre(genre)}
                        disabled={voted}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all relative overflow-hidden ${
                          selectedGenre === genre && !voted
                            ? 'border-red-500/50 bg-red-500/10'
                            : isMine
                            ? 'border-green-500/30 bg-green-500/5'
                            : isTop
                            ? 'border-white/15 bg-white/[0.03]'
                            : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                        } ${voted ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`absolute inset-0 rounded-xl transition-all duration-700 ${
                            isTop ? 'bg-white/[0.04]' : 'bg-transparent'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            {isMine && <CheckCircle size={13} className="text-green-400" />}
                            {isTop && !isMine && <span className="text-[10px] text-amber-400">&#9654;</span>}
                            <span className={`text-sm font-medium ${isTop || isMine ? 'text-white' : 'text-white/70'}`}>
                              {genre}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {totalVotes > 0 && (
                              <span className="text-[11px] text-white/30">{pct}%</span>
                            )}
                            <span className="text-[11px] text-white/20">{count} vote{count !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!voted && selectedGenre && (
                  <div className="mb-5">
                    <p className="text-[11px] text-white/40 mb-2">How long should it play?</p>
                    <div className="flex gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => setSelectedDuration(d.value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                            selectedDuration === d.value
                              ? 'bg-red-500/15 text-red-300 border-red-500/30'
                              : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vote error */}
                {voteError && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4 text-xs text-red-300">
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{voteError}</span>
                  </div>
                )}

                {/* Submit */}
                {!voted && (
                  <LoadingButton
                    loading={submitting}
                    disabled={!selectedGenre}
                    onClick={handleSubmitVote}
                  >
                    {selectedGenre ? `Vote for ${selectedGenre}` : 'Select a genre'}
                  </LoadingButton>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'song' && (
          <div className="mt-6">
            <p className="text-sm text-white/40 mb-4">
              The DJ can see all requests in the control panel. No guarantees — but we listen!
            </p>

            {songSent && (
              <div className="flex items-center gap-2.5 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl mb-4 text-sm">
                <CheckCircle size={15} className="text-green-400" />
                <span className="text-green-300">Request sent! The DJ got it.</span>
              </div>
            )}

            <div className="relative mb-3">
              <Mic2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                type="text"
                value={songRequest}
                onChange={(e) => setSongRequest(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitSong()}
                placeholder="Artist — Song name"
                maxLength={120}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            {songError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4 text-xs text-red-300">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>{songError}</span>
              </div>
            )}

            <LoadingButton
              loading={songSubmitting}
              disabled={!songRequest.trim()}
              onClick={handleSubmitSong}
            >
              <Send size={13} />
              Send request
            </LoadingButton>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-6 py-3 text-[11px] text-white/20 text-center">
        Powered by RadioDJ &middot; Votes reset each hour
      </div>
    </PageShell>
  );
}
