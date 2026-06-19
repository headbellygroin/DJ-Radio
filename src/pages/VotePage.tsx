import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Radio, Clock, CheckCircle, Music2, Send, AlertCircle, Mic2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Station, VoteTally } from '../lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHourKey() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
  ].join('-');
}

function msUntilNextHour() {
  const now  = new Date();
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getVoterToken(): string {
  const key = 'radiodj_voter_token';
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

function getVotedKey(stationId: string, hourKey: string) {
  return `radiodj_voted_${stationId}_${hourKey}`;
}

// ─── Duration options ────────────────────────────────────────────────────────

const DURATIONS = [
  { label: '1 hour',  value: 60  },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function VotePage() {
  const { slug }  = useParams<{ slug?: string }>();

  const [station, setStation]           = useState<Station | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [voteTallies, setVoteTallies]   = useState<VoteTally[]>([]);
  const [currentWinner, setCurrentWinner] = useState<string | null>(null);

  const [selectedGenre, setSelectedGenre]   = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [submitting, setSubmitting]     = useState(false);
  const [voted, setVoted]               = useState(false);
  const [myVote, setMyVote]             = useState<string | null>(null);

  const [songRequest, setSongRequest]   = useState('');
  const [songSubmitting, setSongSubmitting] = useState(false);
  const [songSent, setSongSent]         = useState(false);

  const [countdownMs, setCountdownMs]   = useState(msUntilNextHour());
  const [tab, setTab]                   = useState<'genre' | 'song'>('genre');

  // ── Load station ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      let query = supabase.from('stations').select('*');
      if (slug) {
        query = query.eq('slug', slug).limit(1);
      } else {
        query = query.order('created_at', { ascending: true }).limit(1);
      }

      const { data, error: err } = await query.maybeSingle();
      if (err || !data) {
        setError(slug ? `Station "${slug}" not found.` : 'No station found.');
      } else {
        setStation(data as Station);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  // ── Check if already voted this hour ────────────────────────────────────
  useEffect(() => {
    if (!station) return;
    const hourKey  = getHourKey();
    const storedVote = localStorage.getItem(getVotedKey(station.id, hourKey));
    if (storedVote) {
      setVoted(true);
      setMyVote(storedVote);
    }
  }, [station]);

  // ── Fetch current winner ─────────────────────────────────────────────────
  const fetchWinner = useCallback(async () => {
    const hourStart = new Date();
    hourStart.setUTCMinutes(0, 0, 0);
    const { data } = await supabase
      .from('hourly_vote_result')
      .select('genre')
      .lte('hour_start', hourStart.toISOString())
      .order('hour_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCurrentWinner(data?.genre ?? null);
  }, []);

  // ── Fetch vote tallies ───────────────────────────────────────────────────
  const fetchTallies = useCallback(async () => {
    if (!station) return;
    const hourKey = getHourKey();
    const { data } = await supabase
      .from('votes')
      .select('value')
      .eq('station_id', station.id)
      .eq('vote_type', 'genre')
      .eq('hour_key', hourKey);

    if (!data) return;

    const genreMap: Record<string, number> = {};
    for (const v of data) {
      genreMap[v.value] = (genreMap[v.value] || 0) + 1;
    }
    setVoteTallies(
      Object.entries(genreMap)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count),
    );
  }, [station]);

  useEffect(() => {
    fetchWinner();
    fetchTallies();
    if (!station) return;

    const channel = supabase
      .channel(`vote-page-${station.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'votes',
          filter: `station_id=eq.${station.id}`,
        },
        fetchTallies,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [station, fetchWinner, fetchTallies]);

  // ── Countdown ticker ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setCountdownMs(msUntilNextHour()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Submit genre vote ───────────────────────────────────────────────────
  const submitVote = async () => {
    if (!station || !selectedGenre || voted) return;
    setSubmitting(true);

    const hourKey    = getHourKey();
    const voterToken = getVoterToken();

    const { error: err } = await supabase.from('votes').insert({
      station_id:       station.id,
      vote_type:        'genre',
      value:            selectedGenre,
      duration_minutes: selectedDuration,
      voter_token:      voterToken,
      hour_key:         hourKey,
    });

    setSubmitting(false);
    if (!err) {
      localStorage.setItem(getVotedKey(station.id, hourKey), selectedGenre);
      setVoted(true);
      setMyVote(selectedGenre);
      fetchTallies();
    }
  };

  // ── Submit song request ─────────────────────────────────────────────────
  const submitSongRequest = async () => {
    if (!station || !songRequest.trim()) return;
    setSongSubmitting(true);

    const hourKey    = getHourKey();
    const voterToken = getVoterToken();

    await supabase.from('votes').insert({
      station_id:  station.id,
      vote_type:   'song',
      value:       songRequest.trim(),
      voter_token: voterToken,
      hour_key:    hourKey,
    });

    setSongSubmitting(false);
    setSongSent(true);
    setSongRequest('');
    setTimeout(() => setSongSent(false), 4000);
  };

  const totalVotes = voteTallies.reduce((s, v) => s + v.count, 0);

  // ── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080a0e] text-white flex items-center justify-center" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="min-h-screen bg-[#080a0e] text-white flex items-center justify-center p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="text-center">
          <AlertCircle size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/50">{error ?? 'Station not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#080a0e] text-white flex flex-col"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
            <Radio size={14} />
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">{station.name}</p>
            <p className="text-[10px] text-white/30 mt-0.5">RadioDJ</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30">
          <Clock size={12} />
          <span>Next vote in {formatCountdown(countdownMs)}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ml-1" />
          <span className="text-red-400 text-[10px] font-medium">LIVE</span>
        </div>
      </header>

      <div className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
        {/* Current genre playing */}
        {currentWinner && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl">
            <Music2 size={14} className="text-white/30 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/30">Currently playing</p>
              <p className="text-sm font-medium truncate">{currentWinner}</p>
            </div>
          </div>
        )}

        {/* Heading */}
        <h1 className="text-xl font-bold mb-1">Vote for the next hour</h1>
        <p className="text-sm text-white/40 mb-6">
          The winning genre plays from {formatCountdown(countdownMs)} from now.
          {totalVotes > 0 && ` ${totalVotes} vote${totalVotes !== 1 ? 's' : ''} cast so far.`}
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-6">
          {(['genre', 'song'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {t === 'genre' ? 'Vote by genre' : 'Request a song'}
            </button>
          ))}
        </div>

        {/* ── GENRE VOTE ─────────────────────────────────────────────────── */}
        {tab === 'genre' && (
          <div>
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
                        {/* Vote bar background */}
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

                {/* Duration picker */}
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

                {/* Submit */}
                {!voted && (
                  <button
                    onClick={submitVote}
                    disabled={!selectedGenre || submitting}
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>{selectedGenre ? `Vote for ${selectedGenre}` : 'Select a genre'}</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SONG REQUEST ───────────────────────────────────────────────── */}
        {tab === 'song' && (
          <div>
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
                onKeyDown={(e) => e.key === 'Enter' && submitSongRequest()}
                placeholder="Artist — Song name"
                maxLength={120}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            <button
              onClick={submitSongRequest}
              disabled={!songRequest.trim() || songSubmitting}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {songSubmitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={13} />
                  Send request
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-6 py-3 text-[11px] text-white/20 text-center">
        Powered by RadioDJ &middot; Votes reset each hour
      </div>
    </div>
  );
}
