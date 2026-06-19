import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Music2, Folder, Play, Pause, SkipForward, SkipBack, Shuffle,
  Volume2, VolumeX, Radio, List, ChevronUp, ChevronDown, Mic2,
  Server, HardDrive, Image as ImageIcon, Clock, Settings, LogOut,
  CheckCircle, AlertCircle, RotateCcw, HelpCircle,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import DJPanel from '../components/DJPanel';
import type {
  Track, ImageAsset, Mode, PlaySource, VoteStatus,
  PlayOrder, LoopMode, Station, PlaybackConfig,
} from '../lib/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVER = 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function msUntilNextHour(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(now.getHours() + 1);
  return next.getTime() - now.getTime();
}

function currentHourStart(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

function getHourKey(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
  ].join('-');
}

function emailToSlug(email: string, uid: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  return `${base}-${uid.slice(0, 6)}`;
}

async function fetchCover(serverId: string): Promise<string | null> {
  try {
    const r = await fetch(`${SERVER}/cover/${serverId}`);
    const { cover } = await r.json();
    if (cover) return `data:${cover.mime};base64,${cover.data}`;
  } catch {}
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PlayerPageProps {
  user: User;
}

export default function PlayerPage({ user }: PlayerPageProps) {
  const navigate = useNavigate();

  // ── Player state ──────────────────────────────────────────────────────────
  const [mode, setMode]           = useState<Mode>('idle');
  const [tracks, setTracks]       = useState<Track[]>([]);
  const [queue, setQueue]         = useState<Track[]>([]);
  const [images, setImages]       = useState<ImageAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]   = useState(0);
  const [volume, setVolume]       = useState(1);
  const [muted, setMuted]         = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [serverStatus, setServerStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [bgImageIndex, setBgImageIndex] = useState(0);
  const [coverUrl, setCoverUrl]   = useState<string | null>(null);

  // ── Playback mode ─────────────────────────────────────────────────────────
  const [playOrder, setPlayOrder] = useState<PlayOrder>('random');
  const [loopMode, setLoopMode]   = useState<LoopMode>('loop');

  // ── Station state ─────────────────────────────────────────────────────────
  const [station, setStation]     = useState<Station | null>(null);
  const [stationLoading, setStationLoading] = useState(true);

  // ── Vote / hourly switching state ─────────────────────────────────────────
  const [playSource, setPlaySource]           = useState<PlaySource>('master');
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [pendingGenre, setPendingGenre]       = useState<string | null>(null);
  const [countdownMs, setCountdownMs]         = useState(msUntilNextHour());
  const [showDJPanel, setShowDJPanel]         = useState(false);
  const [genreFolder, setGenreFolder]         = useState<string | null>(null);
  const [lastVoteResult, setLastVoteResult]   = useState<string | null>(null);
  const [voteStatus, setVoteStatus]           = useState<VoteStatus>('idle');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const audioRef        = useRef<HTMLAudioElement>(null);
  const videoRef        = useRef<HTMLVideoElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const progressRef     = useRef<HTMLDivElement>(null);
  const rafRef          = useRef(0);
  const bgTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const hourTimerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingGenreRef = useRef<string | null>(null);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  const isVideoTrack = !!currentTrack?.isVideo;

  const stationUrl = station
    ? `${window.location.origin}/vote/${station.slug}`
    : '';

  // ── Load / create station for this user ──────────────────────────────────
  useEffect(() => {
    const initStation = async () => {
      setStationLoading(true);

      const { data: existing } = await supabase
        .from('stations')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (existing) {
        const s = existing as Station;
        setStation(s);
        setPlayOrder(s.playback_config?.order ?? 'random');
        setLoopMode(s.playback_config?.loop   ?? 'loop');
      } else {
        // First time: create station
        const slug = emailToSlug(user.email ?? 'station', user.id);
        const { data: created } = await supabase
          .from('stations')
          .insert({
            owner_id:        user.id,
            name:            'My Station',
            slug,
            genres:          [],
            playback_config: { order: 'random', loop: 'loop' } satisfies PlaybackConfig,
          })
          .select()
          .single();

        if (created) setStation(created as Station);
      }

      setStationLoading(false);
    };
    initStation();
  }, [user.id, user.email]);

  // ── Sync playback config to station ──────────────────────────────────────
  const savePlaybackConfig = useCallback(async (order: PlayOrder, loop: LoopMode) => {
    if (!station) return;
    await supabase
      .from('stations')
      .update({ playback_config: { order, loop } satisfies PlaybackConfig, updated_at: new Date().toISOString() })
      .eq('id', station.id);
  }, [station]);

  const handlePlayOrder = useCallback((o: PlayOrder) => {
    setPlayOrder(o);
    savePlaybackConfig(o, loopMode);
    // Reorder current queue
    if (tracks.length > 0) {
      setQueue((q) => {
        const reordered = o === 'random' ? shuffleArr(q) : [...tracks];
        const newIdx = currentTrack ? reordered.findIndex((t) => t.id === currentTrack.id) : -1;
        setCurrentIndex(newIdx);
        return reordered;
      });
    }
  }, [loopMode, savePlaybackConfig, tracks, currentTrack]);

  const handleLoopMode = useCallback((l: LoopMode) => {
    setLoopMode(l);
    savePlaybackConfig(playOrder, l);
  }, [playOrder, savePlaybackConfig]);

  // ── Volume sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    [audioRef.current, videoRef.current].forEach((el) => {
      if (el) { el.volume = volume; el.muted = muted; }
    });
  }, [volume, muted]);

  // ── Time RAF ──────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (el) { setCurrentTime(el.currentTime); setDuration(el.duration || 0); }
    rafRef.current = requestAnimationFrame(tick);
  }, [isVideoTrack]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // ── Background image rotation ─────────────────────────────────────────────
  useEffect(() => {
    if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    if (images.length > 1) {
      bgTimerRef.current = setInterval(() => setBgImageIndex((i) => (i + 1) % images.length), 12000);
    }
    return () => { if (bgTimerRef.current) clearInterval(bgTimerRef.current); };
  }, [images]);

  // ── Cover art ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setCoverUrl(null);
    if (!currentTrack) return;
    if (currentTrack.coverUrl !== undefined) { setCoverUrl(currentTrack.coverUrl); return; }
    if (currentTrack.serverId) {
      fetchCover(currentTrack.serverId).then((url) => {
        setCoverUrl(url);
        setQueue((q) => q.map((t) => t.id === currentTrack.id ? { ...t, coverUrl: url } : t));
      });
    }
  }, [currentTrack]);

  // ── Check server ──────────────────────────────────────────────────────────
  const checkServer = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER}/status`);
      if (!r.ok) throw new Error();
      const { ready, genreFolder: gf } = await r.json();
      setServerStatus(ready ? 'ok' : 'error');
      setGenreFolder(gf || null);
      return ready as boolean;
    } catch {
      setServerStatus('error');
      return false;
    }
  }, []);

  const fetchAvailableGenres = useCallback(async (stationToUpdate: Station | null) => {
    try {
      const r = await fetch(`${SERVER}/genres`);
      const { genres } = await r.json();
      const list: string[] = genres || [];
      setAvailableGenres(list);

      // Sync genre list to Supabase so the public vote page can read it
      if (stationToUpdate && list.length > 0) {
        const { data } = await supabase
          .from('stations')
          .update({ genres: list, updated_at: new Date().toISOString() })
          .eq('id', stationToUpdate.id)
          .select()
          .single();
        if (data) setStation(data as Station);
      }
    } catch {
      setAvailableGenres([]);
    }
  }, []);

  // ── Load tracks from source ───────────────────────────────────────────────
  const loadTracksForSource = useCallback(async (source: PlaySource, order: PlayOrder): Promise<Track[] | null> => {
    try {
      const url = source === 'master'
        ? `${SERVER}/tracks`
        : `${SERVER}/tracks?genre=${encodeURIComponent(source)}`;
      const r    = await fetch(url);
      const data = await r.json();
      if (data.error) return null;

      const newTracks: Track[] = (data.tracks as Array<{ id: string; name: string; isVideo: boolean }>).map((t) => ({
        id: t.id, name: t.name, isVideo: t.isVideo, serverId: t.id,
      }));

      const newImages: ImageAsset[] = (data.images as Array<{ id: string; name: string }>).map((img) => ({
        id: img.id, name: img.name, url: `${SERVER}/file/${img.id}`,
      }));

      setImages(newImages);
      return order === 'random' ? shuffleArr(newTracks) : newTracks;
    } catch {
      return null;
    }
  }, []);

  // ── Initial server load ───────────────────────────────────────────────────
  const loadFromServer = useCallback(async () => {
    const ok = await checkServer();
    if (!ok) return;
    await fetchAvailableGenres(station);

    const newQueue = await loadTracksForSource('master', playOrder);
    if (!newQueue) { setServerStatus('error'); return; }

    setTracks(newQueue);
    setQueue(newQueue);
    setPlaySource('master');
    setMode('server');
    setCurrentIndex(-1);
  }, [checkServer, fetchAvailableGenres, loadTracksForSource, station, playOrder]);

  // ── Tally votes + write result + switch genre at top of hour ─────────────
  const tallyAndSwitch = useCallback(async () => {
    if (!station) {
      // No station yet — fall back to reading hourly_vote_result directly
      const hourStart = currentHourStart().toISOString();
      const { data } = await supabase
        .from('hourly_vote_result')
        .select('genre')
        .lte('hour_start', hourStart)
        .order('hour_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      const genre = data?.genre ?? null;
      setPendingGenre(genre);
      setLastVoteResult(genre);
      return;
    }

    setVoteStatus('fetching');
    const hourKey   = getHourKey();
    const hourStart = currentHourStart().toISOString();

    const { data: voteData } = await supabase
      .from('votes')
      .select('value')
      .eq('station_id', station.id)
      .eq('vote_type', 'genre')
      .eq('hour_key', hourKey);

    // Tally
    const tally: Record<string, number> = {};
    for (const v of voteData ?? []) {
      tally[v.value] = (tally[v.value] || 0) + 1;
    }

    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const genreWinner = winner && availableGenres.includes(winner) ? winner : null;

    // Write result to shared mailbox
    await supabase.from('hourly_vote_result').insert({ hour_start: hourStart, genre: genreWinner });

    setLastVoteResult(genreWinner);
    setPendingGenre(genreWinner);
  }, [station, availableGenres]);

  // ── Apply genre switch after song ends ───────────────────────────────────
  const applyGenreSwitch = useCallback(async (genre: string | null) => {
    const source: PlaySource = (genre && availableGenres.includes(genre)) ? genre : 'master';
    setVoteStatus('fetching');

    const newQueue = await loadTracksForSource(source, playOrder);
    if (!newQueue || newQueue.length === 0) {
      const fallbackQueue = await loadTracksForSource('master', playOrder);
      if (fallbackQueue) {
        setTracks(fallbackQueue);
        setQueue(fallbackQueue);
        setPlaySource('master');
        setCurrentIndex(0);
        setVoteStatus('fallback');
      }
      return;
    }

    setTracks(newQueue);
    setQueue(newQueue);
    setPlaySource(source);
    setCurrentIndex(0);
    setVoteStatus(source === 'master' ? 'fallback' : 'switched');
    setTimeout(() => setVoteStatus('idle'), 8000);
  }, [availableGenres, loadTracksForSource, playOrder]);

  // Keep pendingGenreRef in sync
  useEffect(() => { pendingGenreRef.current = pendingGenre; }, [pendingGenre]);

  // ── Hourly check schedule ─────────────────────────────────────────────────
  const scheduleHourlyCheck = useCallback(() => {
    if (hourTimerRef.current) clearTimeout(hourTimerRef.current);
    const ms = msUntilNextHour();
    hourTimerRef.current = setTimeout(async () => {
      if (mode === 'server') {
        await tallyAndSwitch();
      }
      scheduleHourlyCheck();
    }, ms);
  }, [mode, tallyAndSwitch]);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => setCountdownMs(msUntilNextHour()), 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  useEffect(() => {
    if (mode === 'server') scheduleHourlyCheck();
    return () => { if (hourTimerRef.current) clearTimeout(hourTimerRef.current); };
  }, [mode, scheduleHourlyCheck]);

  // ── Play track ────────────────────────────────────────────────────────────
  const playTrack = useCallback((index: number, queueSnapshot?: Track[]) => {
    const q = queueSnapshot || queue;
    if (index < 0 || index >= q.length) return;
    const track = q[index];
    setCurrentIndex(index);

    const url = track.serverId ? `${SERVER}/file/${track.serverId}` : track.localUrl!;

    if (track.isVideo) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      const vid = videoRef.current!;
      vid.src = url; vid.load();
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; }
      const aud = audioRef.current!;
      aud.src = url; aud.load();
      aud.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [queue]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (loopMode === 'loop') {
        playTrack(0);
      } else {
        setIsPlaying(false);
      }
    } else {
      playTrack(nextIndex);
    }
  }, [currentIndex, queue, playTrack, loopMode]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (el && el.currentTime > 3) { el.currentTime = 0; return; }
    playTrack((currentIndex - 1 + queue.length) % queue.length);
  }, [currentIndex, queue, playTrack, isVideoTrack]);

  const togglePlay = () => {
    if (queue.length === 0) return;
    if (currentIndex === -1) { playTrack(0); return; }
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); setIsPlaying(false); }
    else { el.play().then(() => setIsPlaying(true)).catch(() => {}); }
  };

  // ── Song ended — apply pending genre switch or play next ─────────────────
  const handleEnded = useCallback(() => {
    const pending = pendingGenreRef.current;
    if (pending !== null) {
      setPendingGenre(null);
      applyGenreSwitch(pending);
    } else if (loopMode === 'once' && currentIndex >= queue.length - 1) {
      setIsPlaying(false);
    } else {
      playNext();
    }
  }, [playNext, applyGenreSwitch, loopMode, currentIndex, queue.length]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration;
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (el) el.currentTime = t;
  };

  // ── Drag-drop / file input ────────────────────────────────────────────────
  const addMediaFiles = (files: FileList | File[]) => {
    const audioExts = /\.(mp3|wav)$/i;
    const videoExts = /\.(mp4)$/i;
    const imageExts = /\.(jpg|jpeg|png|gif)$/i;
    const newTracks: Track[]     = [];
    const newImages: ImageAsset[] = [];

    Array.from(files).forEach((f) => {
      const url  = URL.createObjectURL(f);
      const name = f.name.replace(/\.(mp3|wav|mp4)$/i, '').replace(/_/g, ' ');
      const id   = `${f.name}-${f.size}`;
      if      (audioExts.test(f.name)) newTracks.push({ id, name, isVideo: false, localUrl: url });
      else if (videoExts.test(f.name)) newTracks.push({ id, name, isVideo: true,  localUrl: url });
      else if (imageExts.test(f.name)) newImages.push({ id, name, url });
    });

    if (newTracks.length > 0) {
      setTracks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        const fresh    = newTracks.filter((t) => !existing.has(t.id));
        const ordered  = playOrder === 'random' ? shuffleArr(fresh) : fresh;
        const merged   = [...prev, ...fresh];
        setQueue((prevQ) => {
          const freshQ = ordered.filter((t) => !prevQ.find((q) => q.id === t.id));
          return [...prevQ, ...freshQ];
        });
        return merged;
      });
      setMode('local');
    }
    if (newImages.length > 0) {
      setImages((prev) => {
        const existing = new Set(prev.map((i) => i.id));
        return [...prev, ...newImages.filter((i) => !existing.has(i.id))];
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addMediaFiles(e.dataTransfer.files);
  };

  const reshuffleQueue = () => {
    setQueue((prev) => {
      const newQ  = shuffleArr(prev);
      const newIdx = currentTrack ? newQ.findIndex((t) => t.id === currentTrack.id) : -1;
      setCurrentIndex(newIdx);
      return newQ;
    });
  };

  // ── DJ overrides ──────────────────────────────────────────────────────────
  const djForceGenre = (genre: string | null) => {
    setPendingGenre(genre);
    setShowDJPanel(false);
  };

  const djSwitchNow = async (genre: string | null) => {
    setPendingGenre(null);
    setShowDJPanel(false);
    await applyGenreSwitch(genre);
    setTimeout(() => playTrack(0), 200);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const progress     = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bgImage      = images.length > 0 ? images[bgImageIndex % images.length] : null;
  const artSrc       = coverUrl || null;
  const showViz      = isPlaying && !isVideoTrack && !artSrc;
  const sourceLabel  = playSource === 'master' ? 'Master' : playSource;

  return (
    <div className="min-h-screen bg-[#080a0e] text-white flex flex-col overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      <audio ref={audioRef} onEnded={handleEnded} preload="auto" />

      {/* Background */}
      {bgImage && (
        <div
          key={bgImage.id}
          className="fixed inset-0 bg-cover bg-center opacity-10 pointer-events-none transition-all duration-[3000ms]"
          style={{ backgroundImage: `url(${bgImage.url})`, zIndex: 0 }}
        />
      )}

      {/* Vote switch notifications */}
      {(voteStatus === 'switched' || voteStatus === 'fallback') && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111318] border border-white/10 shadow-2xl text-sm animate-fade-in">
          {voteStatus === 'switched'
            ? <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
            : <RotateCcw   size={15} className="text-amber-400 flex-shrink-0" />}
          <span className="text-white/80">
            {voteStatus === 'switched' ? `Switched to: ${playSource}` : 'No votes — playing master'}
          </span>
        </div>
      )}

      {pendingGenre !== null && voteStatus !== 'switched' && voteStatus !== 'fallback' && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111318] border border-amber-500/20 shadow-2xl text-sm">
          <Clock size={15} className="text-amber-400 flex-shrink-0" />
          <span className="text-white/60">
            Switching to{' '}
            <span className="text-white font-medium">{pendingGenre ?? 'Master'}</span>{' '}
            after this song
          </span>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
            <Radio size={15} />
          </div>
          <span className="font-semibold tracking-tight">RadioDJ</span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-white/30">
          {mode === 'server' && (
            <>
              <span className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${
                playSource === 'master'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}>
                <HardDrive size={10} />
                {sourceLabel}
              </span>

              <span className="flex items-center gap-1 text-white/25">
                <Clock size={11} />
                <span>{formatCountdown(countdownMs)}</span>
              </span>

              <button
                onClick={() => setShowDJPanel((s) => !s)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  showDJPanel
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                }`}
              >
                <Settings size={11} />
                DJ
              </button>
            </>
          )}

          <div className="flex items-center gap-1 text-white/20">
            <Mic2 size={11} />
            <span>LIVE</span>
          </div>

          <button
            onClick={signOut}
            title="Sign out"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-white/5 text-white/20 hover:text-white/50 hover:border-white/15 transition-colors"
          >
            <LogOut size={11} />
          </button>

          <Link
            to="/help"
            title="User manual"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-white/5 text-white/20 hover:text-white/50 hover:border-white/15 transition-colors"
          >
            <HelpCircle size={11} />
          </Link>
        </div>
      </header>

      {/* DJ Panel */}
      {showDJPanel && mode === 'server' && (
        <DJPanel
          station={station}
          stationUrl={stationUrl}
          availableGenres={availableGenres}
          playSource={playSource}
          pendingGenre={pendingGenre}
          countdownMs={countdownMs}
          lastVoteResult={lastVoteResult}
          genreFolder={genreFolder}
          playOrder={playOrder}
          loopMode={loopMode}
          onPlayOrder={handlePlayOrder}
          onLoopMode={handleLoopMode}
          djForceGenre={djForceGenre}
          djSwitchNow={djSwitchNow}
          onClose={() => setShowDJPanel(false)}
        />
      )}

      <div className="relative z-10 flex flex-col lg:flex-row flex-1 min-h-0">

        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">

          {/* Artwork / video / visualizer */}
          <div className="relative w-56 h-56 sm:w-64 sm:h-64">
            <video
              ref={videoRef}
              onEnded={handleEnded}
              className={`absolute inset-0 w-full h-full object-cover rounded-2xl ${isVideoTrack ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              playsInline
            />
            <div className={`w-full h-full rounded-2xl bg-gradient-to-br from-[#1a1d24] to-[#111318] border border-white/10 flex items-center justify-center overflow-hidden transition-all duration-500 ${
              isPlaying && !isVideoTrack ? 'shadow-[0_0_60px_rgba(239,68,68,0.12)]' : ''
            } ${isVideoTrack ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {artSrc ? (
                <img src={artSrc} alt="cover" className="w-full h-full object-cover" />
              ) : showViz ? (
                <div className="absolute inset-0 flex items-end justify-center gap-[3px] px-6 pb-6 opacity-70">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-red-500 rounded-sm origin-bottom"
                      style={{
                        height: `${20 + Math.random() * 65}%`,
                        animation: `bar ${0.35 + (i % 7) * 0.08}s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.03}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Music2 size={56} className="text-white/10" />
              )}
            </div>
            {isPlaying && (
              <div className="absolute -inset-2 rounded-3xl border border-red-500/15 animate-pulse pointer-events-none" />
            )}
          </div>

          {/* Track name */}
          <div className="text-center max-w-xs w-full">
            <p className="text-base font-semibold truncate">
              {currentTrack ? currentTrack.name : 'No track loaded'}
            </p>
            <p className="text-xs text-white/35 mt-1">
              {queue.length > 0
                ? `${currentIndex + 1} / ${queue.length} · ${isVideoTrack ? 'Video' : 'Audio'} · ${sourceLabel}`
                : 'Load your music to begin'}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-sm space-y-1">
            <div ref={progressRef} onClick={handleProgressClick} className="h-1.5 bg-white/10 rounded-full cursor-pointer group">
              <div
                className="h-full bg-red-500 rounded-full relative transition-[width] duration-100"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-white/25">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-5">
            <button
              onClick={reshuffleQueue}
              title="Reshuffle"
              className={`p-2 transition-colors ${playOrder === 'random' ? 'text-red-400 hover:text-red-300' : 'text-white/20 hover:text-white/40'}`}
            >
              <Shuffle size={17} />
            </button>
            <button onClick={playPrev} disabled={queue.length === 0} className="p-2 text-white/50 hover:text-white disabled:opacity-20 transition-colors">
              <SkipBack size={22} />
            </button>
            <button
              onClick={togglePlay}
              disabled={queue.length === 0}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/40"
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
            </button>
            <button onClick={playNext} disabled={queue.length === 0} className="p-2 text-white/50 hover:text-white disabled:opacity-20 transition-colors">
              <SkipForward size={22} />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className="p-2 text-white/35 hover:text-white transition-colors"
              >
                {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume}
                onChange={(e) => { setVolume(+e.target.value); setMuted(false); }}
                className="w-20 accent-red-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Playback mode quick indicators */}
          <div className="flex items-center gap-3 text-[11px] text-white/20">
            <span className={playOrder === 'sequential' ? 'text-white/50' : ''}>
              {playOrder === 'random' ? 'Random' : 'Sequential'}
            </span>
            <span>·</span>
            <span className={loopMode === 'loop' ? 'text-white/50' : ''}>
              {loopMode === 'loop' ? 'Looping' : 'Play once'}
            </span>
            {mode === 'server' && (
              <>
                <span>·</span>
                <button
                  onClick={() => { setShowDJPanel(true); }}
                  className="text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
                >
                  Change
                </button>
              </>
            )}
          </div>

          {/* Load options */}
          <div className="w-full max-w-sm space-y-3">
            <button
              onClick={loadFromServer}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                serverStatus === 'ok'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/15'
                  : serverStatus === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15'
                  : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Server size={16} />
              <div className="text-left">
                <p className="text-sm font-medium leading-none">
                  {serverStatus === 'ok' ? 'Reload from local server' : 'Connect to local server'}
                </p>
                <p className="text-[11px] mt-1 opacity-60">
                  {serverStatus === 'error'
                    ? 'Server not running — see setup below'
                    : 'node server.mjs /master/path /genre/path'}
                </p>
              </div>
            </button>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`w-full border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                dragOver ? 'border-red-500 bg-red-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Folder size={24} className="mx-auto mb-1.5 text-white/25" />
              <p className="text-sm text-white/40">Drop files or click to browse</p>
              <p className="text-[11px] text-white/20 mt-0.5">.mp3 · .wav · .mp4 · .jpg · .png · .gif</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".mp3,.wav,.mp4,.jpg,.jpeg,.png,.gif"
                className="hidden"
                onChange={(e) => { if (e.target.files) addMediaFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {mode !== 'idle' && (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors py-1"
              >
                <ImageIcon size={13} />
                Add background images (.jpg / .png / .gif)
              </button>
            )}
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif"
              className="hidden"
              onChange={(e) => { if (e.target.files) addMediaFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {tracks.length > 0 && (
            <p className="text-[11px] text-white/20">
              {tracks.length} tracks &bull; {images.length} images &bull; {sourceLabel}
            </p>
          )}

          {/* Server setup instructions */}
          {serverStatus !== 'ok' && (
            <div className="w-full max-w-sm bg-white/[0.03] border border-white/5 rounded-xl p-4 text-[11px] text-white/35 space-y-1.5">
              <p className="text-white/50 font-medium text-xs">Local server setup (one time)</p>
              <p>1. Open a terminal in this project folder</p>
              <p className="font-mono bg-black/40 px-2 py-1 rounded">node server.mjs C:\Music\All C:\Music\Genres</p>
              <p>2. Arg 1 = flat master folder &nbsp;·&nbsp; Arg 2 = genre folder (subfolders = genres)</p>
              <p>3. Click "Connect to local server" above</p>
              <p className="text-white/20">Album art in mp3/mp4 is extracted automatically.</p>
            </div>
          )}

          {mode === 'server' && station && !stationLoading && (
            <div className="w-full max-w-sm bg-white/[0.03] border border-white/5 rounded-xl p-4 text-[11px] text-white/35 space-y-1">
              <p className="text-white/50 font-medium text-xs">Audience vote page</p>
              <p>Share this URL with your viewers:</p>
              <p className="font-mono text-white/50 break-all">{stationUrl}</p>
            </div>
          )}

          {mode === 'server' && availableGenres.length === 0 && genreFolder === null && (
            <div className="w-full max-w-sm flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-[11px] text-amber-300/70">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <p>Genre folder not detected. Start server with both paths to enable vote switching.</p>
            </div>
          )}
        </div>

        {/* Queue sidebar */}
        <div className="lg:w-72 lg:border-l border-white/5 flex flex-col">
          <button
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white/50 hover:text-white border-b border-white/5 transition-colors"
            onClick={() => setShowQueue((s) => !s)}
          >
            <List size={15} />
            <span>Queue ({queue.length})</span>
            {mode === 'server' && playSource !== 'master' && (
              <span className="ml-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                {playSource}
              </span>
            )}
            <span className="ml-auto lg:hidden">
              {showQueue ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </span>
          </button>

          <div className={`overflow-y-auto ${showQueue ? 'block' : 'hidden lg:block'} flex-1`} style={{ maxHeight: '420px' }}>
            {queue.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/15 text-sm">No tracks loaded</div>
            ) : (
              <ul>
                {queue.map((t, i) => (
                  <li
                    key={`${t.id}-${i}`}
                    onClick={() => playTrack(i)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group ${
                      i === currentIndex
                        ? 'bg-red-600/15 border-l-2 border-red-500'
                        : 'hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="w-5 text-center flex-shrink-0">
                      {i === currentIndex && isPlaying ? (
                        <div className="flex items-end gap-px justify-center h-3.5">
                          {[1, 2, 3].map((b) => (
                            <div key={b} className="w-1 bg-red-400 rounded-sm"
                              style={{ height: '100%', animation: `bar ${0.38 + b * 0.14}s ease-in-out infinite alternate` }} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-white/20 group-hover:text-white/40">{i + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${i === currentIndex ? 'text-white font-medium' : 'text-white/50'}`}>
                        {t.name}
                      </p>
                    </div>
                    {t.isVideo && <span className="text-[10px] text-white/20 flex-shrink-0">MP4</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Image strip */}
          {images.length > 0 && (
            <div className="border-t border-white/5 p-3">
              <p className="text-[10px] text-white/25 mb-2">Background images ({images.length})</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.name}
                    onClick={() => setBgImageIndex(i)}
                    className={`w-12 h-12 object-cover rounded cursor-pointer flex-shrink-0 transition-all ${
                      i === bgImageIndex % images.length ? 'ring-2 ring-red-500' : 'opacity-50 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/5 px-6 py-2.5 text-[11px] text-white/20 flex flex-wrap items-center gap-4">
        <span>OBS: Add as Browser Source · 1280×720 · Audio Monitoring: Monitor and Output</span>
        {station && (
          <span className="ml-auto font-mono text-white/15 truncate">{station.slug}</span>
        )}
      </div>

      <style>{`
        @keyframes bar {
          from { transform: scaleY(0.25); }
          to   { transform: scaleY(1); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease forwards; }
      `}</style>
    </div>
  );
}
