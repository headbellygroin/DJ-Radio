import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchCover } from '../lib/localServerClient';
import { shuffleArr } from '../lib/playerUtils';
import { useStation } from '../hooks/useStation';
import { usePlaybackController } from '../hooks/usePlaybackController';
import { useVoteScheduler } from '../hooks/useVoteScheduler';
import type { PlayOrder } from '../lib/types';

import DJPanel from '../components/DJPanel';
import PlayerHeader from '../components/player/PlayerHeader';
import NowPlaying from '../components/player/NowPlaying';
import MediaSourcePicker from '../components/player/MediaSourcePicker';
import QueueSidebar from '../components/player/QueueSidebar';
import PlayerNotifications from '../components/player/PlayerNotifications';

interface PlayerPageProps {
  user: User;
}

export default function PlayerPage({ user }: PlayerPageProps) {
  const navigate = useNavigate();

  const { station, stationLoading, playOrder, loopMode, setPlayOrder, setLoopMode } =
    useStation(user);

  const playback = usePlaybackController();

  const vote = useVoteScheduler({
    station,
    playOrder,
    playback,
  });

  const [showQueue, setShowQueue] = useState(false);
  const [showDJPanel, setShowDJPanel] = useState(false);
  const [bgImageIndex, setBgImageIndex] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const bgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coverAbortRef = useRef<AbortController | null>(null);

  const stationUrl = station
    ? `${window.location.origin}/vote/${station.slug}`
    : '';

  // ── Ended handler (consumes pending switch atomically) ───────────────────
  const handleEnded = useCallback(() => {
    const ps = playback.pendingSwitchRef.current;
    if (ps !== null) {
      playback.pendingSwitchRef.current = null;
      vote.setHasPendingAction(false);
      vote.setPendingGenre(null);
      vote.djSwitchNow(ps.genre);
    } else {
      if (loopMode === 'once' && playback.currentIndex >= playback.queue.length - 1) {
        playback.setIsPlaying(false);
      } else {
        playback.playNext();
      }
    }
  }, [loopMode, playback, vote]);

  // ── Cover art (race-safe with AbortController) ──────────────────────────
  useEffect(() => {
    const track = playback.currentTrack;
    setCoverUrl(null);
    if (!track) return;

    if (track.coverUrl !== undefined) {
      setCoverUrl(track.coverUrl);
      return;
    }

    if (track.serverId) {
      coverAbortRef.current?.abort();
      const controller = new AbortController();
      coverAbortRef.current = controller;

      fetchCover(track.serverId, controller.signal).then((url) => {
        if (track.id === playback.currentTrack?.id) {
          setCoverUrl(url);
          if (url !== null) {
            playback.setQueue((q) =>
              q.map((t) => (t.id === track.id ? { ...t, coverUrl: url } : t)),
            );
          }
        }
      });
    }
    return () => coverAbortRef.current?.abort();
  }, [playback.currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    if (playback.images.length > 1) {
      bgTimerRef.current = setInterval(
        () => setBgImageIndex((i) => (i + 1) % playback.images.length),
        12000,
      );
    }
    return () => {
      if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    };
  }, [playback.images]);

  const handlePlayOrderWithReorder = useCallback(
    (o: PlayOrder) => {
      setPlayOrder(o);
      if (playback.tracks.length > 0) {
        const reordered = o === 'random' ? shuffleArr(playback.queue) : [...playback.tracks];
        const cur = playback.currentTrack;
        const newIdx = cur ? reordered.findIndex((t) => t.id === cur.id) : -1;
        playback.setQueue(reordered);
        if (newIdx >= 0) playback.setCurrentIndex(newIdx);
      }
    },
    [setPlayOrder, playback],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }, [navigate]);

  const bgImage =
    playback.images.length > 0
      ? playback.images[bgImageIndex % playback.images.length]
      : null;

  const sourceLabel = vote.playSource === 'master' ? 'Master' : vote.playSource;

  return (
    <div
      className="min-h-screen bg-[#080a0e] text-white flex flex-col overflow-hidden"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <audio ref={playback.audioRef} onEnded={handleEnded} preload="auto" />
      <video ref={playback.videoRef} onEnded={handleEnded} preload="auto" playsInline />

      {/* Background */}
      {bgImage && (
        <div
          key={bgImage.id}
          className="fixed inset-0 bg-cover bg-center opacity-10 pointer-events-none transition-all duration-[3000ms]"
          style={{ backgroundImage: `url(${bgImage.url})`, zIndex: 0 }}
        />
      )}

      {/* Notifications */}
      <PlayerNotifications
        voteStatus={vote.voteStatus}
        pendingGenre={vote.hasPendingAction ? vote.pendingGenre : null}
        playSource={vote.playSource}
      />

      {/* Header */}
      <PlayerHeader
        mode={playback.mode}
        playSource={vote.playSource}
        countdownMs={vote.countdownMs}
        showDJPanel={showDJPanel}
        onToggleDJ={() => setShowDJPanel((s) => !s)}
        onSignOut={signOut}
      />

      {/* DJ Panel */}
      {showDJPanel && playback.mode === 'server' && (
        <DJPanel
          station={station}
          stationUrl={stationUrl}
          availableGenres={vote.availableGenres}
          playSource={vote.playSource}
          pendingGenre={vote.pendingGenre}
          countdownMs={vote.countdownMs}
          lastVoteResult={vote.lastVoteResult}
          genreFolder={vote.genreFolder}
          playOrder={playOrder}
          loopMode={loopMode}
          onPlayOrder={handlePlayOrderWithReorder}
          onLoopMode={setLoopMode}
          djForceGenre={vote.djForceGenre}
          djSwitchNow={vote.djSwitchNow}
          onClose={() => setShowDJPanel(false)}
        />
      )}

      <div className="relative z-10 flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
          <NowPlaying
            currentTrack={playback.currentTrack}
            queueLength={playback.queue.length}
            currentIndex={playback.currentIndex}
            isVideoTrack={playback.isVideoTrack}
            isPlaying={playback.isPlaying}
            currentTime={playback.currentTime}
            duration={playback.duration}
            coverUrl={coverUrl}
            sourceLabel={sourceLabel}
            playOrder={playOrder}
            loopMode={loopMode}
            mode={playback.mode}
            volume={playback.volume}
            muted={playback.muted}
            videoRef={playback.videoRef}
            progressRef={playback.progressRef}
            onProgressClick={playback.handleProgressClick}
            onPlayPrev={playback.playPrev}
            onPlayNext={playback.playNext}
            onTogglePlay={playback.togglePlay}
            onReshuffle={() => playback.reshuffleQueue(playback.currentTrack?.id)}
            onVolumeChange={(v) => {
              playback.setVolume(v);
              playback.setMuted(false);
            }}
            onToggleMute={() => playback.setMuted((m) => !m)}
            onShowDJ={() => setShowDJPanel(true)}
          />

          <MediaSourcePicker
            mode={playback.mode}
            serverStatus={vote.serverStatus}
            tracksCount={playback.tracks.length}
            imagesCount={playback.images.length}
            sourceLabel={sourceLabel}
            genreFolder={vote.genreFolder}
            availableGenres={vote.availableGenres}
            stationSlug={station?.slug ?? null}
            stationUrl={stationUrl}
            stationLoading={stationLoading}
            onLoadFromServer={vote.loadFromServer}
            onAddMediaFiles={playback.addMediaFiles}
          />
        </div>

        {/* Queue sidebar */}
        <QueueSidebar
          queue={playback.queue}
          currentIndex={playback.currentIndex}
          isPlaying={playback.isPlaying}
          images={playback.images}
          bgImageIndex={bgImageIndex}
          showQueue={showQueue}
          mode={playback.mode}
          playSource={vote.playSource}
          onToggleQueue={() => setShowQueue((s) => !s)}
          onPlayTrack={(i) => playback.playTrack(i)}
          onSelectBgImage={(i) => setBgImageIndex(i)}
        />
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/5 px-6 py-2.5 text-[11px] text-white/20 flex flex-wrap items-center gap-4">
        <span>
          OBS: Add as Browser Source · 1280×720 · Audio Monitoring: Monitor and
          Output
        </span>
        {station && (
          <span className="ml-auto font-mono text-white/15 truncate">
            {station.slug}
          </span>
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
