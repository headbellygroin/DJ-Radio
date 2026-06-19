# RadioDJ — Internet Radio Station Platform

---

## Table of Contents

- [Product vision](#product-vision)
- [How the SaaS model works](#how-the-saas-model-works)
- [Architecture](#architecture)
- [File structure](#file-structure)
- [Database schema](#database-schema)
- [Platform owner setup — what you do once](#platform-owner-setup--what-you-do-once)
- [Subscriber setup — what each subscriber does](#subscriber-setup--what-each-subscriber-does)
- [Stripe configuration](#stripe-configuration)
- [Deploying the vote page](#deploying-the-vote-page)
- [Development setup (local)](#development-setup-local)
- [Running the app](#running-the-app)
- [Tech stack](#tech-stack)
- [Coder's guide — build order](#coders-guide--build-order)
- [Key implementation notes](#key-implementation-notes)

---

## Product vision

### Side 1 — You as the DJ

You have a large music library organised by genre — too many tracks for YouTube/Spotify/Apple Music uploads, but perfect for a continuous stream. The goal is passive income by running a live radio station on YouTube, Rumble, Kick, and other platforms simultaneously.

- Player runs on your computer, captured by OBS as a browser source.
- OBS encodes and pushes the stream to YouTube/Rumble/Kick via RTMP.
- Tracks play randomly by genre (audio + video files mixed), set it and forget it.
- Audience votes on what genre plays next via a public URL.

**Voting engagement model:**
- **Free vote** — one free vote per hour, gets people participating.
- **Paid vote** — audience pays to have their vote count as more (e.g. $1 = 5 votes, $5 = 25 votes). Converts audience attention into direct revenue.
- **Vote by song** — request a specific song.
- **Vote duration** — 60/120/180-minute windows (column exists, tally logic to be built).
- The winning genre (weighted by paid votes) auto-switches at the top of the hour.

### Side 2 — SaaS subscriptions for other DJs

Other streamers subscribe to use your platform. They:
- Log in with their own account through your hosted site.
- Run the local player app on their own machine against their own music library.
- Get their own station, their own vote page, their own audience.
- Keep 100% of what they earn from streaming.
- You collect recurring subscription fees.

Their music files never leave their computer. Your infrastructure is just Supabase (auth, votes, config) plus the hosted vote page.

---

## How the SaaS model works

### The HTTPS problem — and the solution

When the player app is served from `https://your-domain.com`, browsers block all requests to `http://localhost:3001` (the local file server) as "mixed content." There is no workaround that doesn't require complex subscriber configuration.

**The solution: split the deployment.**

| Part | Where it runs | Who uses it |
|---|---|---|
| **Vote page** (`/vote/:slug`) | Hosted on your domain (Vercel/Netlify, HTTPS) | Audience — any device |
| **Login / signup** (`/login`) | Hosted on your domain (HTTPS) | New subscribers |
| **Player** (`/`) | Local machine, `http://localhost:5173` | DJ only |
| **File server** (`:3001`) | Local machine, `http://localhost:3001` | DJ only (via player) |

The player runs locally — no HTTPS issue. Subscribers download the app, run it on their machine, authenticate against your shared Supabase. Subscription check happens on login. The vote page is the only thing that needs to be publicly accessible.

**This is the right architecture.** It also fits how your users (streamers) already work — they're already running OBS locally. Running two terminal commands is not a barrier for them. Electron packaging is a future option once the model is proven.

```
YOUR SERVER (Vercel/Netlify — HTTPS)
┌─────────────────────────────────────────┐
│  https://radiodj.com                    │
│  ├── /login         (sign up, log in)   │
│  ├── /vote/:slug    (audience voting)   │
│  └── /pricing       (subscribe page)   │
└──────────────────┬──────────────────────┘
                   │  Supabase JS SDK
                   ▼
         ┌──────────────────┐      ◄── Stripe webhook
         │    Supabase      │          (updates subscriptions)
         │  (Postgres +     │
         │   Auth +         │
         │   Realtime)      │
         └────────┬─────────┘
                  │
    ┌─────────────┴──────────────────┐
    │                                │
    ▼                                ▼
DJ #1's machine                  DJ #2's machine
(you)                            (subscriber)
┌─────────────────┐              ┌─────────────────┐
│ server.mjs:3001 │              │ server.mjs:3001 │
│ npm run dev     │              │ npm run dev     │
│ OBS → Kick      │              │ OBS → YouTube   │
└─────────────────┘              └─────────────────┘
```

---

## Architecture

### Routes

| Route | Where it runs | Auth | Purpose |
|---|---|---|---|
| `/` | Local (port 5173) | Required | DJ control panel + media player |
| `/login` | Hosted or local | Public | Sign-in / sign-up |
| `/vote/:slug` | Hosted | Public | Audience voting page |
| `/vote` | Hosted | Public | Same — first station if no slug |
| `/help` | Hosted or local | Public | User manual |
| `/settings` | Local | Required | Station name, slug, file server URL *(to build)* |

### Hourly vote cycle (weighted)

```
Audience submits vote
  → INSERT into votes (station_id, vote_type='genre', value, weight, voter_token, hour_key)
     weight = 1 for free; weight = N for paid (set server-side by Edge Function after payment)

At top of each UTC hour — PlayerPage timer fires:
  → SELECT votes WHERE station_id = ? AND hour_key = current_hour
  → Weighted tally: SUM(weight) per genre value
  → Winning genre inserted into hourly_vote_result (station_id, hour_start, genre)
  → pendingGenre set in React state

On current track ending:
  → GET /tracks?genre=<winner> from server.mjs
  → Load new queue, start playback
```

### Streaming to multiple platforms

The app does not stream. OBS does. The flow:
1. OBS adds `http://localhost:5173` as a Browser Source.
2. OBS encodes and pushes to YouTube/Rumble/Kick via RTMP stream keys.
3. To stream to all three simultaneously: OBS supports multiple outputs via the `obs-multi-rtmp` plugin, or use [Restream.io](https://restream.io) as the single destination.
4. Viewers watch on those platforms — they never visit localhost.
5. Viewers vote at `https://radiodj.com/vote/your-slug`.

No changes to this app are needed to add streaming destinations.

---

## File structure

```
/workspace
├── index.html
├── server.mjs                   # Local file server
├── package.json
├── vite.config.ts               # Reads VITE_FILE_SERVER_URL env var
├── .env                         # Local — not in git (see .env.example)
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260513103324_create_hourly_vote_result.sql
│   │   ├── 20260618164706_create_stations_and_votes.sql
│   │   └── 20260619000000_saas_foundation.sql   ← station_id, weight, subscriptions
│   └── functions/
│       ├── stripe-webhook/
│       │   └── index.ts         # Handles subscription + vote-purchase Stripe events
│       ├── create-checkout-session/
│       │   └── index.ts         # Creates Stripe Checkout session for subscription
│       └── create-vote-checkout/
│           └── index.ts         # Creates Stripe Checkout session for a vote pack
│
└── src/
    ├── main.tsx
    ├── App.tsx                  # Router + auth + subscription guard (to add)
    ├── lib/
    │   ├── supabase.ts
    │   ├── types.ts
    │   └── time.ts              # Shared UTC time utilities
    ├── components/
    │   └── DJPanel.tsx
    └── pages/
        ├── PlayerPage.tsx       # DJ player
        ├── VotePage.tsx         # Public voting
        ├── LoginPage.tsx
        ├── HelpPage.tsx
        └── SettingsPage.tsx     # Station settings *(to build)*
```

---

## Database schema

Run all migrations in `supabase/migrations/` in chronological order via Supabase SQL editor.

### `stations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `owner_id` | uuid FK → auth.users | cascade delete |
| `name` | text | display name, DJ can edit |
| `slug` | text UNIQUE | used in `/vote/:slug` URL, DJ can edit |
| `genres` | text[] | synced from `GET /genres` |
| `playback_config` | jsonb | `{ order, loop }` |
| `file_server_url` | text | default `http://localhost:3001` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | update manually in all UPDATEs |

### `votes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `station_id` | uuid FK → stations | |
| `vote_type` | text | `'genre'` or `'song'` |
| `value` | text | genre name or song title |
| `duration_minutes` | int | 60/120/180 — stored, not yet used in tally |
| `weight` | int DEFAULT 1 | free = 1; paid votes set server-side by Edge Function |
| `voter_token` | text | UUID from audience `localStorage` |
| `hour_key` | text | UTC bucket e.g. `"2026-06-19-14"` |

### `hourly_vote_result`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `station_id` | uuid nullable FK | **always set going forward** |
| `hour_start` | timestamptz | top-of-hour UTC |
| `genre` | text nullable | NULL = master folder fallback |

### `subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `user_id` | uuid UNIQUE FK → auth.users | one row per user |
| `tier` | text | `'free'` / `'starter'` / `'pro'` / `'owner'` |
| `status` | text | `'active'` / `'trialing'` / `'past_due'` / `'canceled'` |
| `stripe_customer_id` | text | set by Stripe webhook |
| `stripe_sub_id` | text | set by Stripe webhook |
| `current_period_end` | timestamptz | for renewal display and access enforcement |

RLS: users read their own row; **only service role writes** (Stripe webhook via Edge Function).

---

## Platform owner setup — what you do once

These are the one-time steps to get the platform live.

### 1. Supabase project

- Already done (you have a project). Run all 3 migrations.
- Enable Realtime on the `votes` table: Supabase Dashboard → Database → Replication → toggle `votes`.

### 2. Stripe — products and prices

In your Stripe Dashboard ([dashboard.stripe.com](https://dashboard.stripe.com)):

**Subscription products (recurring):**

| Product name | Billing | What to call the Price ID |
|---|---|---|
| RadioDJ Starter | Monthly (set your price) | `STRIPE_PRICE_STARTER` |
| RadioDJ Pro | Monthly (set your price) | `STRIPE_PRICE_PRO` |

**Vote pack products (one-time payment):**

| Product name | Amount | Weight | What to call the Price ID |
|---|---|---|---|
| Vote Boost 5 | $1.00 | 5 votes | `STRIPE_PRICE_BOOST_5` |
| Vote Boost 25 | $4.00 | 25 votes | `STRIPE_PRICE_BOOST_25` |
| Vote Boost 100 | $10.00 | 100 votes | `STRIPE_PRICE_BOOST_100` |

You set the prices. The weight ratio (how many votes per dollar) is yours to decide.

**Webhook:**

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://[your-supabase-project-ref].supabase.co/functions/v1/stripe-webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** — you'll need it as `STRIPE_WEBHOOK_SECRET`.

### 3. Supabase Edge Functions — secrets

In Supabase Dashboard → Edge Functions → Manage secrets, add:

| Secret name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Your Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from step 2 above (`whsec_...`) |
| `STRIPE_PRICE_STARTER` | Price ID from Stripe (`price_...`) |
| `STRIPE_PRICE_PRO` | Price ID from Stripe (`price_...`) |
| `STRIPE_PRICE_BOOST_5` | Price ID from Stripe (`price_...`) |
| `STRIPE_PRICE_BOOST_25` | Price ID from Stripe (`price_...`) |
| `STRIPE_PRICE_BOOST_100` | Price ID from Stripe (`price_...`) |
| `APP_URL` | Your hosted domain e.g. `https://radiodj.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into Edge Functions — you don't need to add those.

### 4. Deploy Edge Functions

```bash
npx supabase functions deploy stripe-webhook
npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-vote-checkout
```

### 5. Set yourself as owner

After you create your own account, run this in Supabase SQL editor (replace with your actual user ID from `auth.users`):

```sql
INSERT INTO subscriptions (user_id, tier, status)
VALUES ('your-user-uuid-here', 'owner', 'active')
ON CONFLICT (user_id) DO UPDATE SET tier = 'owner', status = 'active';
```

The `'owner'` tier bypasses all subscription checks in the app.

### 6. Deploy the vote page

Deploy this repo to [Vercel](https://vercel.com) or [Netlify](https://netlify.com):

```bash
# Add environment variables in Vercel/Netlify dashboard:
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
# VITE_FILE_SERVER_URL is intentionally omitted on the hosted version
# (the hosted version only serves vote pages, not the player)
```

The player route (`/`) will redirect to `/login` if accessed from the hosted URL, which is fine — subscribers are told to run it locally.

### 7. Create a .env.example for subscribers

Create a `.env.example` in the repo root (safe to commit — uses placeholder values):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
VITE_FILE_SERVER_URL=http://localhost:3001
```

Replace with your actual Supabase URL and anon key. The anon key is safe to share — it's public by design and Supabase RLS controls what it can access.

---

## Subscriber setup — what each subscriber does

Full details in `SUBSCRIBER_SETUP.md`. Summary:

1. Sign up at your website, pay via Stripe.
2. Receive welcome email with `.env` values (your Supabase URL + anon key).
3. Download/clone the repo.
4. `npm install`
5. Create `.env` from the values in the welcome email.
6. Organise music into Master + Genres folders.
7. `node server.mjs "/path/to/Master" "/path/to/Genres"` in one terminal.
8. `npm run dev` in another terminal.
9. Open `http://localhost:5173`, log in.
10. Add OBS browser source: `http://localhost:5173`.
11. Stream.

**What subscribers need installed on their computer:**
- [Node.js LTS](https://nodejs.org) (free)
- [OBS Studio](https://obsproject.com) (free)
- Git (or just download the ZIP from GitHub)

That's it. No other software. No server. No hosting fees on their end.

---

## Stripe configuration

### Subscription flow (DJ subscribes to your platform)

```
Subscriber visits /pricing on your hosted site
  → Clicks "Subscribe" (Starter or Pro)
  → Frontend calls create-checkout-session Edge Function with auth token + tier
  → Edge Function creates Stripe Checkout session, returns URL
  → Browser redirects to Stripe Checkout
  → Subscriber pays
  → Stripe fires checkout.session.completed to stripe-webhook Edge Function
  → Edge Function upserts into subscriptions table (tier, status=active, stripe IDs)
  → Subscriber's local player app checks subscriptions on next login → access granted
```

### Paid vote flow (audience pays to boost their vote)

```
Audience visits /vote/:slug
  → Clicks "Boost vote" → selects a vote pack
  → Frontend calls create-vote-checkout Edge Function with:
      stationId, voterToken, hourKey, voteValue, packId
  → Edge Function creates one-time Stripe Checkout session
  → Browser redirects to Stripe Checkout
  → Audience pays
  → Stripe fires checkout.session.completed to stripe-webhook Edge Function
  → Edge Function inserts vote with weight=N into votes table (server-side — secure)
  → Browser returns to vote page → realtime tally updates immediately
```

### Why votes are inserted server-side

The `weight` field cannot be set by the browser. Anyone could send `weight=9999` in a direct API call. The Edge Function inserts the vote after confirming payment — Stripe's webhook signature is verified first. This is the only secure path for paid voting.

---

## Deploying the vote page

The audience vote page works perfectly from HTTPS. The player does not (it calls localhost). This is the intentional split.

**Vercel (recommended):**
1. Push this repo to GitHub (done).
2. Connect the repo in [vercel.com/new](https://vercel.com/new).
3. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Vercel handles build (`npm run build`) automatically.

The vote page at `https://your-project.vercel.app/vote/your-slug` works immediately. Set a custom domain in Vercel settings.

---

## Development setup (local)

### Prerequisites

- Node.js LTS
- A [Supabase](https://supabase.com) project

### Install

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in your Supabase values:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FILE_SERVER_URL=http://localhost:3001
```

### Run migrations

Supabase Dashboard → SQL Editor → run each file in `supabase/migrations/` in order.

### Enable Realtime

Supabase → Database → Replication → enable `votes` table.

### Music folder structure

```
/Music/Master/      ← flat, all songs (fallback)
  song1.mp3

/Music/Genres/      ← one subfolder per genre
  Rock/
    song.mp3
  Jazz/
    song.wav
  Electronic/
    track.mp4
```

Genre folder names become the vote options on your audience page. They must exactly match what's stored in `stations.genres`.

---

## Running the app

**Terminal 1 — file server:**
```bash
node server.mjs "/path/to/Master" "/path/to/Genres"
```

**Terminal 2 — player:**
```bash
npm run dev
```

Open `http://localhost:5173`. A station is auto-created on first login.

```bash
npm run build       # production build
npm run typecheck   # TypeScript check
npm run lint        # ESLint
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Lucide icons |
| Routing | React Router v7 |
| Backend / DB | Supabase (PostgreSQL, Auth, Realtime) |
| File server | Node.js `server.mjs`, `music-metadata` |
| Payments | Stripe (subscriptions + vote packs) |
| Hosting (vote page) | Vercel / Netlify |
| Streaming | OBS Studio (not this app) |

---

## Coder's guide — build order

Work in this order. Each phase is independently shippable.

### Phase 1 — Make the SaaS gate work (unlock subscribers)

**1.1 — Fix `hourly_vote_result` queries** *(15 min)*
The migration added `station_id` to the table. Now update the code:
- `PlayerPage.tsx` → `tallyAndSwitch()`: add `station_id: station.id` to the INSERT.
- `VotePage.tsx` → `fetchWinner()`: add `.eq('station_id', station.id)` to the SELECT.

**1.2 — Weighted vote tally** *(10 min)*
In `PlayerPage.tsx` → `tallyAndSwitch()`, the SELECT needs to include `weight`:
```ts
// current (wrong for paid votes):
tally[v.value] = (tally[v.value] || 0) + 1;

// replace with:
tally[v.value] = (tally[v.value] || 0) + (v.weight ?? 1);
```
Also update the Supabase SELECT to include `weight` in the columns.

**1.3 — Subscription gate in App.tsx** *(1 hour)*
After auth resolves in `App.tsx`, query the `subscriptions` table:
- If `tier === 'owner'` → full access.
- If `status === 'active'` and `current_period_end > now()` → full access.
- Otherwise → render a `<SubscribeWall>` component instead of `<PlayerPage>`.

The `SubscribeWall` should show a brief pitch and a "Subscribe" button that opens a Stripe Checkout session (via `create-checkout-session` Edge Function).

**1.4 — Deploy Edge Functions** *(30 min)*
Fill in the Price IDs in `supabase/functions/stripe-webhook/index.ts` and deploy all three functions.

**1.5 — Deploy vote page to Vercel** *(20 min)*
See [Deploying the vote page](#deploying-the-vote-page). Vote page, login, and `/help` all work from the hosted URL.

---

### Phase 2 — Subscriber UX

**2.1 — Settings page (`/settings`)** *(2–3 hours)*
Auth-required page. Lets DJ:
- Edit station `name` and `slug` (slug validates unique, alphanumeric-dash).
- See and copy their vote page URL.
- See/edit `file_server_url` (for non-default port or future remote use).
- Link to Stripe customer portal for billing management.

Stripe customer portal URL: `stripe.billingPortal.sessions.create(...)` — add a `create-portal-session` Edge Function, or link directly from the settings page.

**2.2 — Auto-connect to file server on mount** *(30 min)*
In `PlayerPage.tsx`, after `ensureStation()` resolves, automatically call `loadFromServer()` if the file server responds to `GET /status`. Remove the manual "Connect" button (or make it a "Reconnect" fallback). This makes the app truly set-and-forget.

**2.3 — Error feedback on VotePage** *(30 min)*
Vote submit failures are currently silent. Add an error state — show a dismissible banner when a vote INSERT fails.

---

### Phase 3 — Paid voting

**3.1 — Vote pack UI on VotePage** *(2–3 hours)*
Below the free genre vote buttons, add a "Boost your vote" section showing the three vote pack options (5 / 25 / 100 votes). When clicked, call `create-vote-checkout` Edge Function, redirect to Stripe Checkout. On return from Stripe, the vote is already in the DB (inserted by the webhook). Show a confirmation.

**3.2 — Vote pack success redirect** *(30 min)*
Stripe redirects back to `?vote_success=true` query param. VotePage detects this and shows a confirmation message.

---

### Phase 4 — Quality and polish

**4.1 — Duration-based genre windows** *(2–3 hours)*
`duration_minutes` is stored per vote. Implement: weighted-average (or highest-voted) duration determines the next genre window. Instead of always triggering at the UTC hour, schedule the next switch at `now + chosen_duration`. This changes `scheduleHourlyCheck` in `PlayerPage`.

**4.2 — DB unique constraint on free votes** *(20 min)*
```sql
CREATE UNIQUE INDEX votes_one_free_per_token_per_hour
  ON votes (voter_token, station_id, hour_key)
  WHERE weight = 1;
```
Paid votes (weight > 1) are intentionally not constrained — each payment is a separate row.

**4.3 — Station name / slug management UI** *(part of 2.1)*
Slug validation: lowercase alphanumeric and dashes only, 3–30 chars, unique. Show live preview of the vote URL as the DJ types.

**4.4 — `stations.updated_at` trigger** *(10 min)*
```sql
CREATE EXTENSION IF NOT EXISTS moddatetime;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON stations
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
```

---

## Key implementation notes

### File ID encoding

File IDs passed between `server.mjs` and the React app are `base64url`-encoded absolute paths on the DJ's machine. Never construct these IDs in the browser — always take them from a server response. Decoding them outside of `server.mjs` is safe but meaningless (the path only makes sense on that machine).

### Auto station creation

`PlayerPage` calls `ensureStation()` on mount. It upserts to `stations` keyed by `owner_id`. If no station exists, it creates one with a slug derived from the user's UUID. There is no "create station" UI — it just happens. The settings page (Phase 2) lets the DJ change the name and slug after the fact.

### Genre list sync

`PlayerPage` calls `GET /genres` → gets folder names → writes to `stations.genres`. The vote page reads `stations.genres` to show voting buttons. Genre names must exactly match folder names (including capitalisation).

### UTC everywhere

All time functions are in `src/lib/time.ts`. They are all UTC. Do not use `setHours`, `getHours`, `setMinutes` for anything in the vote/tally cycle. Use `setUTCHours`, `getUTCHours`, `setUTCMinutes`.

### `weight` is always set server-side for paid votes

Never trust the client to set `weight` on a vote. The Edge Function inserts the vote row after verifying the Stripe payment. The browser's role in the paid flow is: choose a genre + click buy → Stripe Checkout → done. It never touches the `weight` field directly.

### Supabase `service_role` key in Edge Functions

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Use it only in Edge Functions (server-side). Never expose it to the browser. The `stripe-webhook` and `create-vote-checkout` functions need it to write to `votes` and `subscriptions` regardless of the caller's auth status.

### Stripe Checkout metadata

The vote purchase flow passes `station_id`, `voter_token`, `hour_key`, `vote_value`, and `weight` as metadata on the Stripe Checkout session. The webhook handler reads this metadata and uses it to insert the vote. This is the only place `weight > 1` is ever set.

### OBS browser source

1. OBS → Sources → `+` → Browser Source
2. URL: `http://localhost:5173`
3. Width × Height: match stream resolution (1920×1080 typical)
4. "Shutdown source when not visible" — saves CPU when scene is inactive

The player has a dark/transparent UI designed for this context. Do not add opaque wrappers around it.

### Playback config persistence

`playOrder` and `loopMode` are persisted to `stations.playback_config` (jsonb) on every change in `DJPanel`. They are restored from Supabase on mount. React state always mirrors the DB value.
