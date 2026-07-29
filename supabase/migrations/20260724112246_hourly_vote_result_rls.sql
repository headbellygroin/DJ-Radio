-- Lock down hourly_vote_result RLS: only the station owner can write results.
-- Public reads are exposed through the get_current_winner RPC created earlier.
-- The player app is authenticated as the station owner (RequireAuth + useStation),
-- so owner-scoped writes work via the authenticated session.

DROP POLICY IF EXISTS "Anyone can read vote results" ON hourly_vote_result;
DROP POLICY IF EXISTS "Voting system can insert results" ON hourly_vote_result;

-- Owner-only writes (INSERT/UPDATE/DELETE). The USING clause also gives the
-- authenticated owner SELECT on their own station's rows; anon has no access.
CREATE POLICY "owner_write_hourly_vote_result" ON hourly_vote_result
  FOR ALL
  TO authenticated
  USING (auth.uid() = (SELECT owner_id FROM stations WHERE id = station_id))
  WITH CHECK (auth.uid() = (SELECT owner_id FROM stations WHERE id = station_id));

-- No public SELECT policy: public reads go through get_current_winner RPC.

ALTER TABLE hourly_vote_result
  ADD CONSTRAINT chk_hourly_vote_result_hour_aligned
  CHECK (date_trunc('hour', hour_start) = hour_start);
