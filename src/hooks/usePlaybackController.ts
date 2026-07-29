import { useState, useRef, useEffect, useCallback } from 'react';
import type { Track, ImageAsset, Mode } from '../lib/types';
import { SERVER } from '../lib/localServerClient';
import { shuffleArr } from '../lib/playerUtils';

/* ── Pending-switch sentinel ───────────────────────────────────────────────
 * null               = no pending action
 * { genre: null }    = pending switch to master
 * { genre: 'rock' }  = pending switch to a genre folder
 */
export type PendingSwitch = { genre: string | null } | null;

export interface PlaybackController {
  // DOM refs
  audioRef: React.RefObject<HTMLAudioElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  imageInputRef: React.RefObject<HTMLInputElement>;
  progressRef: React.RefObject<HTMLDivElement>;

  // Core state
  tracks: Track[];
  queue: Track[];
  images: ImageAsset[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  mode: Mode;

  // Derived
  currentTrack: Track | null;
  isVideoTrack: boolean;

  // Queue management
  replaceQueue: (newTracks: Track[], newImages: ImageAsset[], startIndex: number) => void;

  // Playback controls
  playTrack: (index: number, queueSnapshot?: Track[]) => void;
  playNext: () => void;
  playPrev: () => void;
  togglePlay: () => void;

  // UI actions
  handleProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  reshuffleQueue: (currentTrackId: string | undefined) => void;
  addMediaFiles: (files: FileList | File[]) => { images: ImageAsset[] };

  // Server reload integration
  clearActivePlayback: () => void;

  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  setQueue: React.Dispatch<React.SetStateAction<Track[]>>;
  setImages: React.Dispatch<React.SetStateAction<ImageAsset[]>>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;

  // Pending switch ref (read by handleEnded in coordinator)
  pendingSwitchRef: React.MutableRefObject<PendingSwitch>;
}

export function usePlaybackController(): PlaybackController {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const rafRef = useRef(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const pendingSwitchRef = useRef<PendingSwitch>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');

  const currentTrack =
    currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const isVideoTrack = !!currentTrack?.isVideo;

  useEffect(() => {
    const els = [audioRef.current, videoRef.current];
    for (const el of els) {
      if (el) {
        el.volume = volume;
        el.muted = muted;
      }
    }
  }, [volume, muted]);

  const tick = useCallback(() => {
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (el) {
      setCurrentTime(el.currentTime);
      setDuration(el.duration || 0);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [isVideoTrack]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const trackObjectUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
  }, []);

  const playTrack = useCallback(
    (index: number, queueSnapshot?: Track[]) => {
      const q = queueSnapshot ?? queue;
      if (index < 0 || index >= q.length) return;
      const track = q[index];
      setCurrentIndex(index);

      const url = track.serverId
        ? `${SERVER}/file/${track.serverId}`
        : track.localUrl!;

      if (track.isVideo) {
        const aud = audioRef.current;
        if (aud) {
          aud.pause();
          aud.src = '';
        }
        const vid = videoRef.current!;
        vid.src = url;
        vid.load();
        vid.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        const vid = videoRef.current;
        if (vid) {
          vid.pause();
          vid.src = '';
        }
        const aud = audioRef.current!;
        aud.src = url;
        aud.load();
        aud.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    },
    [queue],
  );

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    const next = currentIndex + 1;
    if (next >= queue.length) {
      setIsPlaying(false);
    } else {
      playTrack(next);
    }
  }, [currentIndex, queue.length, playTrack]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      return;
    }
    const idx = (currentIndex - 1 + queue.length) % queue.length;
    playTrack(idx);
  }, [currentIndex, queue.length, playTrack, isVideoTrack]);

  const togglePlay = useCallback(() => {
    if (queue.length === 0) return;
    if (currentIndex === -1) {
      playTrack(0);
      return;
    }
    const el = isVideoTrack ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [queue.length, currentIndex, isVideoTrack, isPlaying, playTrack]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const t = ((e.clientX - rect.left) / rect.width) * duration;
      const el = isVideoTrack ? videoRef.current : audioRef.current;
      if (el) el.currentTime = t;
    },
    [duration, isVideoTrack],
  );

  const replaceQueue = useCallback(
    (newTracks: Track[], newImages: ImageAsset[], startIndex: number) => {
      setTracks(newTracks);
      setQueue(newTracks);
      setImages(newImages);
      setCurrentIndex(startIndex);
    },
    [],
  );

  const reshuffleQueue = useCallback((currentTrackId: string | undefined) => {
    setQueue((prevQ) => {
      const newQ = shuffleArr(prevQ);
      const idx = currentTrackId
        ? newQ.findIndex((t) => t.id === currentTrackId)
        : -1;
      queueMicrotask(() => setCurrentIndex(idx >= 0 ? idx : -1));
      return newQ;
    });
  }, []);

  const clearActivePlayback = useCallback(() => {
    const aud = audioRef.current;
    const vid = videoRef.current;
    if (aud) {
      aud.pause();
      aud.src = '';
    }
    if (vid) {
      vid.pause();
      vid.src = '';
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex(-1);
  }, []);

  const addMediaFiles = useCallback(
    (files: FileList | File[]) => {
      const audioExts = /\.(mp3|wav)$/i;
      const videoExts = /\.(mp4)$/i;
      const imageExts = /\.(jpg|jpeg|png|gif)$/i;

      const newTracks: Track[] = [];
      const newImages: ImageAsset[] = [];

      for (const f of Array.from(files)) {
        const url = URL.createObjectURL(f);
        trackObjectUrl(url);
        const name = f.name.replace(/\.(mp3|wav|mp4)$/i, '').replace(/_/g, ' ');
        const id = `${f.name}-${f.size}`;
        if (audioExts.test(f.name)) {
          newTracks.push({ id, name, isVideo: false, localUrl: url });
        } else if (videoExts.test(f.name)) {
          newTracks.push({ id, name, isVideo: true, localUrl: url });
        } else if (imageExts.test(f.name)) {
          newImages.push({ id, name, url });
        }
      }

      if (newTracks.length > 0) {
        setTracks((prev) => {
          const existing = new Set(prev.map((t) => t.id));
          const fresh = newTracks.filter((t) => !existing.has(t.id));
          setQueue((prevQ) => {
            const ordered = shuffleArr(fresh);
            const freshQ = ordered.filter((t) => !prevQ.find((q) => q.id === t.id));
            return [...prevQ, ...freshQ];
          });
          return [...prev, ...fresh];
        });
        setMode('local');
      }

      if (newImages.length > 0) {
        setImages((prev) => {
          const existing = new Set(prev.map((i) => i.id));
          return [...prev, ...newImages.filter((i) => !existing.has(i.id))];
        });
      }

      return { images: newImages };
    },
    [trackObjectUrl],
  );

  return {
    audioRef,
    videoRef,
    fileInputRef,
    imageInputRef,
    progressRef,

    tracks,
    queue,
    images,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    mode,

    currentTrack,
    isVideoTrack,

    replaceQueue,
    playTrack,
    playNext,
    playPrev,
    togglePlay,
    handleProgressClick,
    reshuffleQueue,
    addMediaFiles,
    clearActivePlayback,

    setTracks,
    setQueue,
    setImages,
    setCurrentIndex,
    setMode,
    setIsPlaying,
    setVolume,
    setMuted,

    pendingSwitchRef,
  };
}
