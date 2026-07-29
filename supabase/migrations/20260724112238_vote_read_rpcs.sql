-- Safe read access patterns: SECURITY DEFINER RPCs that bypass RLS to expose
-- only aggregated/distinct vote data and the current hourly winner.
--
-- Applied BEFORE the RLS lockdown migrations (dedupe, votes RLS, hourly_vote_result
-- RLS) so public reads keep working throughout the rollout. Once the SELECT policies
-- are dropped, these functions become the ONLY sanctioned read path for votes and
-- hourly_vote_result.

CREATE OR REPLACE FUNCTION get_genre_tallies(p_station_id uuid, p_hour_key text)
RETURNS TABLE (genre text, count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT value AS genre, COUNT(*) AS count
  FROM votes
  WHERE station_id = p_station_id
    AND vote_type = 'genre'
    AND hour_key = p_hour_key
  GROUP BY value
  ORDER BY count DESC, value ASC;
$$;

CREATE OR REPLACE FUNCTION get_song_requests(p_station_id uuid, p_hour_key text)
RETURNS TABLE (value text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT value
  FROM votes
  WHERE station_id = p_station_id
    AND vote_type = 'song'
    AND hour_key = p_hour_key
  ORDER BY value
  LIMIT 30;
$$;

CREATE OR REPLACE FUNCTION get_current_winner(p_station_id uuid, p_at_time timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT genre
  FROM hourly_vote_result
  WHERE station_id = p_station_id
    AND hour_start <= p_at_time
  ORDER BY hour_start DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION submit_vote(
  p_station_id uuid,
  p_vote_type text,
  p_value text,
  p_duration_minutes int,
  p_voter_token text,
  p_hour_key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO votes (station_id, vote_type, value, duration_minutes, voter_token, hour_key)
  VALUES (p_station_id, p_vote_type, p_value, p_duration_minutes, p_voter_token, p_hour_key)
  ON CONFLICT (station_id, hour_key, vote_type, voter_token) DO NOTHING;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION get_genre_tallies(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_song_requests(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_winner(uuid, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_vote(uuid, text, text, int, text, text) TO anon, authenticated;
