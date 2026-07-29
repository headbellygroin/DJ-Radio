/*
# Secure and repair the personal-use launch path

This migration restores public voting, prevents direct access to private vote rows,
and makes station and hourly-result creation safe when multiple dashboard tabs are open.

## 1. Modified tables
- `votes`: adds one-vote-per-voter-per-hour uniqueness and validates vote shape.
- `stations`: enforces one station per owner.
- `hourly_vote_result`: enforces one result per station and hour and validates hour alignment.

## 2. Public data access
- Adds `get_public_station` so visitors receive only the station name, slug, genres, and ID.
- Keeps genre tallies and current winners available as aggregated public information.
- Restricts song-request reads to the authenticated owner of the requested station.

## 3. Vote submission
- Replaces `submit_vote` with a validated server-side operation.
- Accepts only the current UTC hour, configured station genres, supported durations,
  bounded song requests, and well-formed voter tokens.
- Removes direct anonymous table inserts so callers cannot bypass validation.

## 4. Security
- Removes public reads of station internals, raw vote rows, and hourly-result rows.
- Adds separate owner-scoped SELECT, INSERT, UPDATE, and DELETE policies for hourly results.
- Revokes default PUBLIC execution from security-definer functions and grants only the
  roles required by each user-facing flow.

## 5. Important notes
1. Existing indexes and data are preserved.
2. Index creation is idempotent and safe to repeat on this project's current data.
3. Public visitors continue to vote and view aggregated results without signing in.
*/

CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_voter_hour
  ON public.votes (station_id, hour_key, vote_type, voter_token);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stations_owner
  ON public.stations (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hourly_vote_result_station_hour
  ON public.hourly_vote_result (station_id, hour_start);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_votes_shape'
  ) THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT chk_votes_shape CHECK (
        vote_type IN ('genre', 'song')
        AND char_length(btrim(value)) BETWEEN 1 AND 120
        AND char_length(voter_token) BETWEEN 8 AND 128
        AND (
          (vote_type = 'genre' AND duration_minutes IN (60, 120, 180))
          OR (vote_type = 'song' AND duration_minutes IS NULL)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_hourly_vote_result_hour_aligned'
  ) THEN
    ALTER TABLE public.hourly_vote_result
      ADD CONSTRAINT chk_hourly_vote_result_hour_aligned
      CHECK (date_trunc('hour', hour_start) = hour_start);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_station(p_slug text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, slug text, genres text[])
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.slug, s.genres
  FROM public.stations AS s
  WHERE p_slug IS NULL OR s.slug = p_slug
  ORDER BY s.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_genre_tallies(p_station_id uuid, p_hour_key text)
RETURNS TABLE (genre text, count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT v.value AS genre, COUNT(*) AS count
  FROM public.votes AS v
  WHERE v.station_id = p_station_id
    AND v.vote_type = 'genre'
    AND v.hour_key = p_hour_key
  GROUP BY v.value
  ORDER BY count DESC, v.value ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_song_requests(p_station_id uuid, p_hour_key text)
RETURNS TABLE (value text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT v.value
  FROM public.votes AS v
  WHERE v.station_id = p_station_id
    AND v.vote_type = 'song'
    AND v.hour_key = p_hour_key
    AND EXISTS (
      SELECT 1
      FROM public.stations AS s
      WHERE s.id = p_station_id
        AND s.owner_id = auth.uid()
    )
  ORDER BY v.value
  LIMIT 30;
$$;

CREATE OR REPLACE FUNCTION public.get_current_winner(
  p_station_id uuid,
  p_at_time timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT r.genre
  FROM public.hourly_vote_result AS r
  WHERE r.station_id = p_station_id
    AND r.hour_start <= p_at_time
  ORDER BY r.hour_start DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_vote(
  p_station_id uuid,
  p_vote_type text,
  p_value text,
  p_duration_minutes int,
  p_voter_token text,
  p_hour_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_genres text[];
  v_value text := btrim(p_value);
  v_current_hour text := to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH');
BEGIN
  SELECT s.genres INTO v_genres
  FROM public.stations AS s
  WHERE s.id = p_station_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found';
  END IF;

  IF p_hour_key <> v_current_hour THEN
    RAISE EXCEPTION 'Voting hour has changed';
  END IF;

  IF char_length(p_voter_token) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'Invalid voter token';
  END IF;

  IF p_vote_type = 'genre' THEN
    IF NOT (v_value = ANY(v_genres)) OR p_duration_minutes NOT IN (60, 120, 180) THEN
      RAISE EXCEPTION 'Invalid genre vote';
    END IF;
  ELSIF p_vote_type = 'song' THEN
    IF char_length(v_value) NOT BETWEEN 1 AND 120 OR p_duration_minutes IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid song request';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid vote type';
  END IF;

  INSERT INTO public.votes (
    station_id,
    vote_type,
    value,
    duration_minutes,
    voter_token,
    hour_key
  )
  VALUES (
    p_station_id,
    p_vote_type,
    v_value,
    p_duration_minutes,
    p_voter_token,
    p_hour_key
  )
  ON CONFLICT (station_id, hour_key, vote_type, voter_token) DO NOTHING;

  RETURN FOUND;
END;
$$;

DROP POLICY IF EXISTS "public_read_stations" ON public.stations;
DROP POLICY IF EXISTS "owner_select_station" ON public.stations;
CREATE POLICY "owner_select_station" ON public.stations
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "public_insert_votes" ON public.votes;
DROP POLICY IF EXISTS "public_read_votes" ON public.votes;
DROP POLICY IF EXISTS "anon_insert_votes" ON public.votes;

DROP POLICY IF EXISTS "Anyone can read vote results" ON public.hourly_vote_result;
DROP POLICY IF EXISTS "Voting system can insert results" ON public.hourly_vote_result;
DROP POLICY IF EXISTS "owner_write_hourly_vote_result" ON public.hourly_vote_result;

DROP POLICY IF EXISTS "owner_select_hourly_vote_result" ON public.hourly_vote_result;
CREATE POLICY "owner_select_hourly_vote_result" ON public.hourly_vote_result
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT s.owner_id FROM public.stations AS s WHERE s.id = station_id));

DROP POLICY IF EXISTS "owner_insert_hourly_vote_result" ON public.hourly_vote_result;
CREATE POLICY "owner_insert_hourly_vote_result" ON public.hourly_vote_result
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT s.owner_id FROM public.stations AS s WHERE s.id = station_id));

DROP POLICY IF EXISTS "owner_update_hourly_vote_result" ON public.hourly_vote_result;
CREATE POLICY "owner_update_hourly_vote_result" ON public.hourly_vote_result
  FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT s.owner_id FROM public.stations AS s WHERE s.id = station_id))
  WITH CHECK (auth.uid() = (SELECT s.owner_id FROM public.stations AS s WHERE s.id = station_id));

DROP POLICY IF EXISTS "owner_delete_hourly_vote_result" ON public.hourly_vote_result;
CREATE POLICY "owner_delete_hourly_vote_result" ON public.hourly_vote_result
  FOR DELETE TO authenticated
  USING (auth.uid() = (SELECT s.owner_id FROM public.stations AS s WHERE s.id = station_id));

REVOKE ALL ON FUNCTION public.get_public_station(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_genre_tallies(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_song_requests(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_winner(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_vote(uuid, text, text, int, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_station(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_genre_tallies(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_song_requests(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_winner(uuid, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vote(uuid, text, text, int, text, text) TO anon, authenticated;
