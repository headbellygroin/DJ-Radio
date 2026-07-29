/*
  # Add station_id to hourly_vote_result

  Scope vote results to individual stations so each station reads its own winner.

  1. Add `station_id` (nullable initially, then NOT NULL after cleanup)
  2. Delete all legacy rows — they predate station scoping and cannot be accurately assigned
  3. Enforce NOT NULL
  4. Add foreign key to `stations` with `ON DELETE CASCADE`
  5. Replace single-column index with composite `(station_id, hour_start DESC)` index
*/

-- 1. Add column (nullable so cleanup can run)
ALTER TABLE hourly_vote_result ADD COLUMN station_id uuid;

-- 2. Delete all legacy rows — they were written without a station_id and cannot be
--    accurately scoped to any one station. Future inserts must include station_id.
DELETE FROM hourly_vote_result;

-- 3. Enforce NOT NULL now that every surviving (zero) row is compliant
ALTER TABLE hourly_vote_result ALTER COLUMN station_id SET NOT NULL;

-- 4. Add foreign key matching the pattern used by votes.station_id
ALTER TABLE hourly_vote_result
  ADD CONSTRAINT fk_hourly_vote_result_station
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;

-- 5. Drop old index; replace with composite covering station-scoped queries
DROP INDEX IF EXISTS idx_hourly_vote_result_hour_start;
CREATE INDEX IF NOT EXISTS idx_hourly_vote_result_station_hour
  ON hourly_vote_result (station_id, hour_start DESC);
