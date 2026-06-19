/*
  # SaaS Foundation Migration

  Fixes two architectural bugs and adds the schema columns needed for:
  - Multi-tenant vote results (station_id on hourly_vote_result)
  - Paid/weighted voting (weight on votes)
  - Configurable file server URL per DJ (file_server_url on stations)
  - Subscription tracking per user (subscriptions table)

  ## Changes

  ### hourly_vote_result
  - ADD station_id (nullable FK → stations) — null = legacy single-station rows
  - ADD index on (station_id, hour_start DESC) for fast per-station lookup

  ### votes
  - ADD weight integer DEFAULT 1 — free vote = 1; paid votes set higher value
    (1 free vote : N paid votes ratio is enforced in application logic, not here)

  ### stations
  - ADD file_server_url text DEFAULT 'http://localhost:3001'
    Each DJ's local file server may run on a different host/port.
    Stored here so the player can read it on login instead of hardcoding.

  ### subscriptions (new table)
  - Tracks which users have an active DJ subscription.
  - Stripe webhook handler should UPDATE status and current_period_end here.
  - RLS: users can read their own row; service role updates via webhook.

  ## Notes
  - station_id on hourly_vote_result is nullable so existing rows are not broken.
    After deploying this migration, update PlayerPage and VotePage to always
    filter by station_id. Once all rows have station_id populated, add NOT NULL.
  - weight on votes does not retroactively change existing vote tallies.
    Existing rows keep DEFAULT 1.
*/

-- ── hourly_vote_result: add station_id ──────────────────────────────────────

ALTER TABLE hourly_vote_result
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hourly_vote_result_station_hour
  ON hourly_vote_result(station_id, hour_start DESC);

-- ── votes: add weight for paid voting ────────────────────────────────────────

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 1;

-- ── stations: configurable file server URL ────────────────────────────────────

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS file_server_url text NOT NULL DEFAULT 'http://localhost:3001';

-- ── subscriptions: SaaS tier tracking ────────────────────────────────────────
/*
  tier values (application-defined — enforce in code, not a DB enum so you can
  add tiers without a migration):
    'free'     — account exists, no paid subscription
    'starter'  — entry-level paid plan
    'pro'      — full-featured paid plan
    'owner'    — the platform owner (you); bypass all subscription checks

  status values:
    'active'   — subscription is current
    'trialing' — in trial period
    'past_due' — payment failed, grace period
    'canceled' — subscription ended
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                text        NOT NULL DEFAULT 'free',
  status              text        NOT NULL DEFAULT 'active',
  stripe_customer_id  text,
  stripe_sub_id       text,
  current_period_end  timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription row
CREATE POLICY "user_read_own_subscription" ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only service role (Stripe webhook handler) inserts/updates subscriptions.
-- Authenticated users cannot write their own subscription row.
-- (Supabase service role bypasses RLS by default.)
