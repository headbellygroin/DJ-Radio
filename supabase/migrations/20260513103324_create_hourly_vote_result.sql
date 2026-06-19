/*
  # Create hourly_vote_result table

  ## Purpose
  Acts as a shared mailbox between the external voting website and this radio player.
  The voting site writes the winning genre here; the player reads it at the top of each hour.

  ## New Tables
  - `hourly_vote_result`
    - `id` (uuid, primary key)
    - `hour_start` (timestamptz) — the exact top-of-hour this result applies to (e.g. 2026-05-13 14:00:00+00)
    - `genre` (text, nullable) — the winning genre folder name, NULL means fall back to master folder
    - `created_at` (timestamptz) — when this result was written

  ## Security
  - RLS enabled
  - Anon users (the player) can SELECT to read results
  - Anon users can INSERT new results (so the voting site can write via anon key)
  - No UPDATE or DELETE allowed — results are append-only

  ## Notes
  1. The player queries for the most recent row WHERE hour_start <= now() to get the active setting
  2. The external voting site should insert a row shortly before or at the top of the hour
  3. genre must exactly match the subfolder name inside the genre music folder
  4. NULL genre = play from master flat folder (no subfolders)
*/

CREATE TABLE IF NOT EXISTS hourly_vote_result (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_start  timestamptz NOT NULL,
  genre       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hourly_vote_result_hour_start
  ON hourly_vote_result (hour_start DESC);

ALTER TABLE hourly_vote_result ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vote results"
  ON hourly_vote_result FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Voting system can insert results"
  ON hourly_vote_result FOR INSERT
  TO anon
  WITH CHECK (true);
