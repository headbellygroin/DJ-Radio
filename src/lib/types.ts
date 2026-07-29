export interface Track {
  id: string;
  name: string;
  isVideo: boolean;
  serverId?: string;
  localUrl?: string;
  coverUrl?: string | null;
}

export interface ImageAsset {
  id: string;
  name: string;
  url: string;
}

export type PlayOrder  = 'random' | 'sequential';
export type LoopMode   = 'loop'   | 'once';
export type Mode       = 'idle'   | 'server' | 'local';
export type PlaySource = 'master' | string;
export type VoteStatus = 'idle'   | 'fetching' | 'switched' | 'fallback';

export interface PlaybackConfig {
  order: PlayOrder;
  loop:  LoopMode;
}

export interface Station {
  id:              string;
  owner_id:        string;
  name:            string;
  slug:            string;
  genres:          string[];
  playback_config: PlaybackConfig;
  created_at:      string;
  updated_at:      string;
}

export interface VoteTally {
  genre: string;
  count: number;
}

/** Row shape inserted into the `votes` table. */
export interface VoteRow {
  station_id:       string;
  vote_type:        'genre' | 'song';
  value:            string;
  voter_token:      string;
  hour_key:         string;
  duration_minutes?: number;
}

/** Row shape selected from `hourly_vote_result`. */
export interface HourlyVoteResult {
  id?:         string;
  station_id:  string;
  hour_start:  string;
  genre:       string | null;
  created_at?: string;
}
