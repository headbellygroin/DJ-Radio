import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { emailToSlug } from '../lib/playerUtils';
import type { Station, PlayOrder, LoopMode, PlaybackConfig } from '../lib/types';

interface UseStationResult {
  station: Station | null;
  stationLoading: boolean;
  playOrder: PlayOrder;
  loopMode: LoopMode;
  setPlayOrder: (o: PlayOrder) => void;
  setLoopMode: (l: LoopMode) => void;
}

export function useStation(user: User): UseStationResult {
  const [station, setStation] = useState<Station | null>(null);
  const [stationLoading, setStationLoading] = useState(true);
  const [playOrder, setPlayOrder] = useState<PlayOrder>('random');
  const [loopMode, setLoopMode] = useState<LoopMode>('loop');

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setStationLoading(true);

      const { data: existing } = await supabase
        .from('stations')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (existing) {
        const s = existing as Station;
        setStation(s);
        setPlayOrder(s.playback_config?.order ?? 'random');
        setLoopMode(s.playback_config?.loop ?? 'loop');
      } else {
        const slug = emailToSlug(user.email ?? 'station', user.id);
        const { data: created } = await supabase
          .from('stations')
          .insert({
            owner_id: user.id,
            name: 'My Station',
            slug,
            genres: [],
            playback_config: { order: 'random' as PlayOrder, loop: 'loop' as LoopMode } satisfies PlaybackConfig,
          })
          .select()
          .single();

        if (!cancelled && created) setStation(created as Station);
      }

      if (!cancelled) setStationLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [user.id, user.email]);

  const savePlaybackConfig = useCallback(
    async (order: PlayOrder, loop: LoopMode) => {
      if (!station) return;
      await supabase
        .from('stations')
        .update({
          playback_config: { order, loop } satisfies PlaybackConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', station.id);
    },
    [station],
  );

  const handleSetPlayOrder = useCallback(
    (o: PlayOrder) => {
      setPlayOrder(o);
      savePlaybackConfig(o, loopMode);
    },
    [loopMode, savePlaybackConfig],
  );

  const handleSetLoopMode = useCallback(
    (l: LoopMode) => {
      setLoopMode(l);
      savePlaybackConfig(playOrder, l);
    },
    [playOrder, savePlaybackConfig],
  );

  return {
    station,
    stationLoading,
    playOrder,
    loopMode,
    setPlayOrder: handleSetPlayOrder,
    setLoopMode: handleSetLoopMode,
  };
}
