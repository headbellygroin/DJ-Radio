-- Lock down votes RLS: remove the public read policy (raw per-voter rows must never
-- be exposed) and narrow the anon insert policy. Aggregated reads now go exclusively
-- through the SECURITY DEFINER RPCs (get_genre_tallies, get_song_requests) created
-- in the preceding migration.

DROP POLICY IF EXISTS "public_insert_votes" ON votes;
DROP POLICY IF EXISTS "public_read_votes" ON votes;

-- Public inserts remain available so the external voting page can record votes
-- (including authenticated users testing their own vote page), bounded by the
-- table CHECK constraint below.
CREATE POLICY "anon_insert_votes" ON votes
  FOR INSERT
  WITH CHECK (true);

-- No SELECT policy: raw per-voter rows are never exposed to any role.
-- Aggregated reads go through get_genre_tallies / get_song_requests RPCs.

ALTER TABLE votes
  ADD CONSTRAINT chk_votes_shape
  CHECK (
    vote_type IN ('genre', 'song')
    AND value <> ''
    AND char_length(voter_token) BETWEEN 8 AND 128
  );
