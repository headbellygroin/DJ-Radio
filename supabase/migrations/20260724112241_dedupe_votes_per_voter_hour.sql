-- Deduplicate pre-existing votes: keep only the lowest id per
-- (station_id, hour_key, vote_type, voter_token), then enforce uniqueness going
-- forward. The unique index makes duplicate votes physically impossible and lets
-- the client use ON CONFLICT DO NOTHING upserts.

DELETE FROM votes
WHERE id NOT IN (
  SELECT MIN(id)
  FROM votes
  GROUP BY station_id, hour_key, vote_type, voter_token
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_voter_hour
  ON votes (station_id, hour_key, vote_type, voter_token);

-- idx_votes_token is now redundant: the unique index covers the same lookup paths
-- (station_id + hour_key are leading columns). Drop it to avoid duplicate indexes.
DROP INDEX IF EXISTS idx_votes_token;
