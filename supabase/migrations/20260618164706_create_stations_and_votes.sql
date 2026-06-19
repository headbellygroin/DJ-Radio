
-- STATIONS: one per station owner, stores genre list for public vote page
CREATE TABLE IF NOT EXISTS stations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text        NOT NULL DEFAULT 'My Station',
  slug            text        NOT NULL UNIQUE,
  genres          text[]      NOT NULL DEFAULT '{}',
  playback_config jsonb       NOT NULL DEFAULT '{"order":"random","loop":"loop"}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stations_slug  ON stations(slug);
CREATE INDEX IF NOT EXISTS idx_stations_owner ON stations(owner_id);

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

-- Public vote page must look up a station by slug without auth
CREATE POLICY "public_read_stations" ON stations FOR SELECT
  USING (true);

CREATE POLICY "owner_insert_station" ON stations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "owner_update_station" ON stations FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "owner_delete_station" ON stations FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);


-- VOTES: audience votes; station_id + hour_key bucket per hour
CREATE TABLE IF NOT EXISTS votes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id       uuid        NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  vote_type        text        NOT NULL CHECK (vote_type IN ('genre', 'song')),
  value            text        NOT NULL,
  duration_minutes int,
  voter_token      text        NOT NULL,
  hour_key         text        NOT NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_votes_station_hour ON votes(station_id, hour_key);
CREATE INDEX IF NOT EXISTS idx_votes_token       ON votes(voter_token, station_id, hour_key);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_votes" ON votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_votes" ON votes FOR SELECT
  USING (true);
