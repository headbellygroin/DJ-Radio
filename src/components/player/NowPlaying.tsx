import { Music2, Shuffle, SkipBack, Play, Pause, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { Track, PlayOrder, LoopMode, Mode } from '../../lib/types';
import { formatTime } from '../../lib/playerUtils';

interface NowPlayingProps {
  currentTrack: Track | null;
  queueLength: number;
  currentIndex: number;
  isVideoTrack: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  coverUrl: string | null;
  sourceLabel: string;
  playOrder: PlayOrder;
  loopMode: LoopMode;
  mode: Mode;
  volume: number;
  muted: boolean;

  videoRef: React.RefObject<HTMLVideoElement>;
  progressRef: React.RefObject<HTMLDivElement>;

  onProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onPlayPrev: () => void;
  onPlayNext: () => void;
  onTogglePlay: () => void;
  onReshuffle: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onShowDJ: () => void;
}

export default function NowPlaying({
  currentTrack,
  queueLength,
  currentIndex,
  isVideoTrack,
  isPlaying,
  currentTime,
  duration,
  coverUrl,
  sourceLabel,
  playOrder,
  loopMode,
  mode,
  volume,
  muted,

  videoRef,
  progressRef,

  onProgressClick,
  onPlayPrev,
  onPlayNext,
  onTogglePlay,
  onReshuffle,
  onVolumeChange,
  onToggleMute,
  onShowDJ,
}: NowPlayingProps) {
  const artSrc = coverUrl;
  const showViz = isPlaying && !isVideoTrack && !artSrc;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
      {/* Artwork / video / visualizer */}
      <div className="relative w-56 h-56 sm:w-64 sm:h-64">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover rounded-2xl ${
            isVideoTrack ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          playsInline
        />
        <div
          className={`w-full h-full rounded-2xl bg-gradient-to-br from-[#1a1d24] to-[#111318] border border-white/10 flex items-center justify-center overflow-hidden transition-all duration-500 ${
            isPlaying && !isVideoTrack
              ? 'shadow-[0_0_60px_rgba(239,68,68,0.12)]'
              : ''
          } ${isVideoTrack ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
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
          {queueLength > 0
            ? `${currentIndex + 1} / ${queueLength} · ${isVideoTrack ? 'Video' : 'Audio'} · ${sourceLabel}`
            : 'Load your music to begin'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm space-y-1">
        <div
          ref={progressRef}
          onClick={onProgressClick}
          className="h-1.5 bg-white/10 rounded-full cursor-pointer group"
        >
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
          onClick={onReshuffle}
          title="Reshuffle"
          className={`p-2 transition-colors ${
            playOrder === 'random'
              ? 'text-red-400 hover:text-red-300'
              : 'text-white/20 hover:text-white/40'
          }`}
        >
          <Shuffle size={17} />
        </button>
        <button
          onClick={onPlayPrev}
          disabled={queueLength === 0}
          className="p-2 text-white/50 hover:text-white disabled:opacity-20 transition-colors"
        >
          <SkipBack size={22} />
        </button>
        <button
          onClick={onTogglePlay}
          disabled={queueLength === 0}
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/40"
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
        <button
          onClick={onPlayNext}
          disabled={queueLength === 0}
          className="p-2 text-white/50 hover:text-white disabled:opacity-20 transition-colors"
        >
          <SkipForward size={22} />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="p-2 text-white/35 hover:text-white transition-colors"
          >
            {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => onVolumeChange(+e.target.value)}
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
              onClick={onShowDJ}
              className="text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
            >
              Change
            </button>
          </>
        )}
      </div>
    </div>
  );
}
