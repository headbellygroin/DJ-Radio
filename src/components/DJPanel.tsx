import { useEffect, useState, useCallback } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Station, VoteTally, PlaySource, PlayOrder, LoopMode } from '../lib/types';
import { getHourKey, formatCountdown } from '../lib/time';

interface DJPanelProps {
  station:         Station | null;
  stationUrl:      string;
  availableGenres: string[];
  playSource:      PlaySource;
  pendingGenre:    string | null;
  countdownMs:     number;
  lastVoteResult:  string | null;
  genreFolder:     string | null;
  playOrder:       PlayOrder;
  loopMode:        LoopMode;
  onPlayOrder:     (o: PlayOrder) => void;
  onLoopMode:      (l: LoopMode)  => void;
  djForceGenre:    (genre: string | null) => void;
  djSwitchNow:     (genre: string | null) => void;
  onClose:         () => void;
}

type Tab = 'override' | 'votes' | 'requests' | 'playback';

export default function DJPanel({
  station, stationUrl, availableGenres, playSource, pendingGenre,
  countdownMs, lastVoteResult, genreFolder,
  playOrder, loopMode, onPlayOrder, onLoopMode,
  djForceGenre, djSwitchNow, onClose,
}: DJPanelProps) {
  const [tab, setTab]               = useState<Tab>('override');
  const [voteTallies, setVoteTallies] = useState<VoteTally[]>([]);
  const [songRequests, setSongRequests] = useState<string[]>([]);
  const [copied, setCopied]         = useState(false);

  const hourKey     = getHourKey();
  const sourceLabel = playSource === 'master' ? 'Master' : playSource;

  const fetchVotes = useCallback(async () => {
    if (!station) return;
    const { data } = await supabase
      .from('votes')
      .select('vote_type, value')
      .eq('station_id', station.id)
      .eq('hour_key', hourKey);

    if (!data) return;

    const genreMap: Record<string, number> = {};
    const songs: string[] = [];

    for (const v of data) {
      if (v.vote_type === 'genre') {
        genreMap[v.value] = (genreMap[v.value] || 0) + 1;
      } else {
        songs.push(v.value);
      }
    }

    setVoteTallies(
      Object.entries(genreMap)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
    );
    setSongRequests([...new Set(songs)].slice(0, 30));
  }, [station, hourKey]);

  useEffect(() => {
    fetchVotes();
    if (!station) return;

    const channel = supabase
      .channel(`dj-votes-${station.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'votes',
          filter: `station_id=eq.${station.id}`,
        },
        fetchVotes,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [station, fetchVotes]);

  const copyUrl = () => {
    navigator.clipboard.writeText(stationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalGenreVotes = voteTallies.reduce((s, v) => s + v.count, 0);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'override',  label: 'Override'                          },
    { id: 'votes',     label: `Votes (${totalGenreVotes})`        },
    { id: 'requests',  label: `Requests (${songRequests.length})` },
    { id: 'playback',  label: 'Playback'                          },
  ];

  return (
    <div className="relative z-20 border-b border-white/5 bg-[#0d0f14] px-6 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-white/70">DJ Control</p>
            <div className="flex gap-0.5 flex-wrap">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    tab === t.id ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* ── OVERRIDE TAB ─────────────────────────────────────────────────── */}
        {tab === 'override' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status info */}
            <div className="space-y-2 text-[11px] text-white/35">
              <p>
                <span className="text-white/50">Active source:</span>{' '}
                <span className="text-white font-medium">{sourceLabel}</span>
              </p>
              <p>
                <span className="text-white/50">Next hour in:</span>{' '}
                <span className="text-white font-medium">{formatCountdown(countdownMs)}</span>
              </p>
              {lastVoteResult !== null && (
                <p>
                  <span className="text-white/50">Last vote winner:</span>{' '}
                  <span className="text-green-400 font-medium">{lastVoteResult}</span>
                </p>
              )}
              {genreFolder && (
                <p className="truncate">
                  <span className="text-white/50">Genre folder:</span>{' '}
                  <span className="font-mono text-white/40">{genreFolder.split(/[/\\]/).pop()}</span>
                </p>
              )}
              {station && (
                <div className="pt-2 mt-2 border-t border-white/5">
                  <p className="text-white/40 mb-1.5">Audience vote URL:</p>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-[10px] text-white/25">{stationUrl}</span>
                    <button onClick={copyUrl} className="flex-shrink-0 text-white/30 hover:text-white/60">
                      {copied
                        ? <CheckCircle size={12} className="text-green-400" />
                        : <Copy size={12} />
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Genre switches */}
            <div>
              <p className="text-[11px] text-white/35 mb-2">Queue switch after current song:</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => djForceGenre(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    pendingGenre === null && playSource === 'master'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white'
                  }`}
                >
                  Master
                </button>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() => djForceGenre(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      pendingGenre === g
                        ? 'bg-green-500/20 text-green-300 border-green-500/30'
                        : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-white/35 mb-2">Switch immediately:</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => djSwitchNow(null)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-white/50 hover:border-red-500/40 hover:text-red-300 transition-all"
                >
                  Master now
                </button>
                {availableGenres.map((g) => (
                  <button
                    key={g}
                    onClick={() => djSwitchNow(g)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-white/50 hover:border-red-500/40 hover:text-red-300 transition-all"
                  >
                    {g} now
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── VOTES TAB ────────────────────────────────────────────────────── */}
        {tab === 'votes' && (
          <div>
            {voteTallies.length === 0 ? (
              <p className="text-white/25 text-sm text-center py-6">No votes yet this hour</p>
            ) : (
              <div className="space-y-3">
                {voteTallies.map((v, i) => (
                  <div key={v.genre} className="flex items-center gap-3">
                    <span className={`text-[11px] w-28 truncate flex-shrink-0 ${i === 0 ? 'text-green-400 font-medium' : 'text-white/50'}`}>
                      {i === 0 && <span className="mr-1 text-green-500">&#9654;</span>}
                      {v.genre}
                    </span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${i === 0 ? 'bg-green-500' : 'bg-white/20'}`}
                        style={{ width: `${totalGenreVotes > 0 ? Math.round(v.count / totalGenreVotes * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-white/30 w-10 text-right flex-shrink-0">
                      {v.count} <span className="text-white/15">({totalGenreVotes > 0 ? Math.round(v.count / totalGenreVotes * 100) : 0}%)</span>
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-white/20 pt-1">
                  {totalGenreVotes} total vote{totalGenreVotes !== 1 ? 's' : ''} · resets each hour
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── REQUESTS TAB ─────────────────────────────────────────────────── */}
        {tab === 'requests' && (
          <div>
            {songRequests.length === 0 ? (
              <p className="text-white/25 text-sm text-center py-6">No song requests yet</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {songRequests.map((req, i) => (
                  <li key={i} className="text-xs text-white/50 px-3 py-2 bg-white/[0.03] rounded-lg">
                    {req}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── PLAYBACK TAB ─────────────────────────────────────────────────── */}
        {tab === 'playback' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] text-white/50 mb-2">Play order</p>
              <div className="flex gap-2">
                {(['random', 'sequential'] as PlayOrder[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => onPlayOrder(o)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                      playOrder === o
                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {o === 'random' ? 'Random shuffle' : 'Sequential'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/20 mt-2">
                {playOrder === 'random'
                  ? 'Tracks play in a random order. Reshuffled each time you load a folder.'
                  : 'Tracks play in the order they appear in your folder, by filename.'}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-white/50 mb-2">At end of queue</p>
              <div className="flex gap-2">
                {(['loop', 'once'] as LoopMode[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => onLoopMode(l)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                      loopMode === l
                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {l === 'loop' ? 'Loop forever' : 'Stop after all'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/20 mt-2">
                {loopMode === 'loop'
                  ? 'After the last track, restart from the beginning. Perfect for 24/7 streams.'
                  : 'Playback stops when the last track finishes.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
