# RadioDJ — Personal Internet Radio Station Platform

---

## Table of Contents

- [Product vision](#product-vision)
- [Architecture](#architecture)
- [File structure](#file-structure)
- [Database schema](#database-schema)
- [Development setup](#development-setup)
- [Running the app](#running-the-app)
- [Audience voting](#audience-voting)
- [Tech stack](#tech-stack)
- [Coder's guide — what to build next](#coders-guide--what-to-build-next)
- [Key implementation notes](#key-implementation-notes)

---

## Product vision

### Side 1 — The DJ (you, the station owner)

You have a large music library organised by genre. Too many tracks for YouTube / Spotify / Apple Music uploads, but perfect for a continuous radio stream. The goal is passive income by streaming to YouTube, Rumble, Kick, and other platforms simultaneously.

**How it works for the DJ:**
- The player runs on your computer, captured by OBS as a browser source.
- OBS streams the output to YouTube, Rumble, Kick, etc.
- The player picks tracks randomly from whichever genre is active, mixing audio files and video files.
- Set it and go — once you hit play the station runs itself.

**Voting system — your audience engagement layer:**
- Audience votes on genre via a public URL (your vote page).
- Voting modes to build engagement over time:
  - **Free vote** — one free vote per hour; gets people participating.
  - **Paid vote** — audience pays to have their vote count as more than a free vote (e.g. free = 1, $1 = 5, $5 = 25). Converts audience attention into direct revenue.
  - **Vote by song** — vote for a specific song request.
  - **Vote by hour** — choose which genre plays for the next full hour.
  - **Vote by minutes** — choose how long a genre plays (60 / 120 / 180 min options are in the DB already; tally logic needs to be built).
- The winning genre (weighted by paid votes) auto-switches at the top of the hour without you touching anything.

### Side 2 — The SaaS platform (selling access to other DJs)

Other streamers subscribe to use your platform for their own stations. They:
- Run the file server (`server.mjs`) on their own computer against their own music library.
- Log into your hosted app using their own account.
- Get their own station, their own vote page, their own audience.
- Keep 100% of what they earn from their streams.
- You earn recurring subscription revenue.

Each subscriber's files stay on their machine — your server never touches their music. The only shared infrastructure is Supabase (auth, votes, station config) and the hosted React app.

---

## Architecture

### How the pieces connect

```
┌─────────────────────────────────────────────────────┐
│                   DJ's Computer                     │
│                                                     │
│  /Music/Master/         /Music/Genres/              │
│       └──────────────────────┘                      │
│                    │                                │
│             server.mjs :3001                        │
│           (HTTP, localhost only)                    │
│                    │                                │
│           React App :5173  ────────── OBS           │
│           (PlayerPage)          (browser source)    │
└────────────────────┼────────────────────────────────┘
                     │ Supabase JS SDK
                     ▼
              ┌─────────────┐
              │  Supabase   │◄── Stripe webhook
              │  (Postgres  │    (updates subscriptions)
              │   + Auth    │
              │   + RT)     │
              └──────┬──────┘
                     │ Realtime
                     ▼
          ┌─────────────────────┐
          │  Vote Page          │
          │  /vote/:slug        │
          │  (public — any      │
          │   device/browser)   │
          └─────────────────────┘
                     │
              Stream Viewers
         (YouTube / Rumble / Kick)
```

### Routes

| Route | Auth | Component | Purpose |
|---|---|---|---|
| `/` | Required | `PlayerPage` | DJ control panel + media player |
| `/login` | Public | `LoginPage` | Email/password sign-in and sign-up |
| `/vote/:slug` | Public | `VotePage` | Public audience voting page |
| `/vote` | Public | `VotePage` | Same — picks first station if no slug |
| `/help` | Public | `HelpPage` | In-app user manual |
| `*` | — | — | Redirects to `/` |

### Streaming architecture (important)

The React app does **not** stream video. OBS does. The flow is:

1. `PlayerPage` runs at `http://localhost:5173` on the DJ's machine.
2. OBS adds it as a Browser Source (full-screen, no scrollbars).
3. OBS encodes and pushes to YouTube/Rumble/Kick via RTMP stream keys.
4. Viewers watch the stream on those platforms — they don't visit `localhost:5173`.
5. Viewers visit `http://your-domain/vote/your-slug` to vote — that's the only public URL.

To stream to multiple platforms simultaneously: OBS supports multiple outputs natively (Settings → Stream → use a restream service), or via the `obs-multi-rtmp` plugin. No changes to this app are needed.

### Hourly vote cycle

```
Audience submits vote
  → INSERT into votes (station_id, vote_type='genre', value, weight, voter_token, hour_key)

At top of each UTC hour — PlayerPage timer fires:
  → SELECT votes WHERE station_id = ? AND hour_key = current_hour GROUP BY value
  → Weighted tally: SUM(weight) per genre   ← weight column added, tally logic not yet updated
  → Pick genre with highest weighted total
  → INSERT into hourly_vote_result (station_id, hour_start, genre)
  → Set pendingGenre in React state

On current track ending:
  → GET /tracks?genre=<winner> from server.mjs
  → Load new queue, start playback from winner genre folder
```

---

## File structure

```
/workspace
├── index.html                   # App shell
├── server.mjs                   # Local file server (Node, no bundler)
├── package.json
├── vite.config.ts               # No dev proxy configured; VITE_FILE_SERVER_URL env var supported
├── tailwind.config.js
├── tsconfig.app.json
├── .env                         # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_FILE_SERVER_URL
│
├── supabase/
│   └── migrations/
│       ├── 20260513103324_create_hourly_vote_result.sql   # global winner mailbox (original)
│       ├── 20260618164706_create_stations_and_votes.sql   # stations + votes tables
│       └── 20260619000000_saas_foundation.sql             # station_id on results, weight, subscriptions
│
└── src/
    ├── main.tsx                 # React entry point
    ├── App.tsx                  # BrowserRouter, auth state, RequireAuth guard
    ├── index.css                # Tailwind directives only
    │
    ├── lib/
    │   ├── supabase.ts          # Supabase client singleton
    │   ├── types.ts             # Shared TypeScript interfaces
    │   └── time.ts              # Shared UTC time utilities (getHourKey, msUntilNextHour, etc.)
    │
    ├── components/
    │   └── DJPanel.tsx          # Slide-down panel: Override, Votes, Requests, Playback tabs
    │
    └── pages/
        ├── PlayerPage.tsx       # ~1000 lines — DJ player + hourly tally logic
        ├── VotePage.tsx         # ~470 lines — public voting + song requests + live tallies
        ├── LoginPage.tsx        # Email/password auth
        └── HelpPage.tsx         # In-app user manual (no Supabase calls)
```

### What lives where

- **All playback state** is in `PlayerPage`. No custom hooks extracted yet.
- **Vote submission + realtime** is in `VotePage`.
- **Override controls, live tally, playback settings** are in `DJPanel` (receives callbacks from `PlayerPage` via props).
- **UTC time utilities** (`getHourKey`, `msUntilNextHour`, `currentHourStart`, `formatCountdown`) are in `src/lib/time.ts` — import from there, do not redefine locally.
- **File server URL** — read from `import.meta.env.VITE_FILE_SERVER_URL` with fallback `http://localhost:3001`. Set in `.env`.

---

## Database schema

Run all migration files in `supabase/migrations/` in chronological (filename) order via the Supabase SQL editor.

### `stations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `owner_id` | uuid FK → auth.users | cascade delete |
| `name` | text | display name |
| `slug` | text UNIQUE | used in `/vote/:slug` URL |
| `genres` | text[] | synced from `GET /genres` on the local file server |
| `playback_config` | jsonb | `{ order: 'random'\|'sequential', loop: 'loop'\|'once' }` |
| `file_server_url` | text | defaults `http://localhost:3001`; configurable per DJ |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | not auto-updated (no trigger yet) |

RLS: public SELECT; owner INSERT/UPDATE/DELETE.

### `votes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `station_id` | uuid FK → stations | cascade delete |
| `vote_type` | text | `'genre'` or `'song'` |
| `value` | text | genre name or song title |
| `duration_minutes` | int | 60/120/180 — stored, **tally logic not yet implemented** |
| `weight` | int | DEFAULT 1 — free vote; paid votes set higher. **Tally not yet weighted** |
| `voter_token` | text | UUID from audience browser `localStorage` |
| `hour_key` | text | UTC bucket e.g. `"2026-06-19-14"` |
| `created_at` | timestamptz | |

RLS: public SELECT and INSERT (intentionally open for unauthenticated audience).

### `hourly_vote_result`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `station_id` | uuid nullable FK → stations | nullable for legacy rows; **always set going forward** |
| `hour_start` | timestamptz | top-of-hour UTC timestamp |
| `genre` | text nullable | winning genre; NULL = fall back to master folder |
| `created_at` | timestamptz | |

RLS: anon SELECT and INSERT.

### `subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `user_id` | uuid UNIQUE FK → auth.users | one row per user |
| `tier` | text | `'free'` / `'starter'` / `'pro'` / `'owner'` |
| `status` | text | `'active'` / `'trialing'` / `'past_due'` / `'canceled'` |
| `stripe_customer_id` | text | set by Stripe webhook |
| `stripe_sub_id` | text | set by Stripe webhook |
| `current_period_end` | timestamptz | used to show renewal date and enforce access |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS: users read their own row; only service role (Stripe webhook) writes.

---

## Development setup

### 1. Prerequisites

- Node.js LTS
- A [Supabase](https://supabase.com) project (free tier works)

### 2. Install

```bash
npm install
```

### 3. Environment variables

Create `.env` in the project root (already in `.gitignore`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FILE_SERVER_URL=http://localhost:3001
```

Both Supabase values are in your project → Settings → API.

### 4. Run migrations

Open Supabase SQL editor, run each file in `supabase/migrations/` in chronological order.

### 5. Enable Realtime on the `votes` table

Supabase → Database → Replication → toggle `votes` on. Without this the live vote tallies on the audience page won't update automatically.

### 6. Organise your music folders

**Master folder** — flat directory, all songs (fallback when no genre wins):
```
/Music/Master/
  song1.mp3
  song2.wav
```

**Genre folder** — one subfolder per genre (folder name = what audiences vote on):
```
/Music/Genres/
  Rock/
    song.mp3
  Jazz/
    song.wav
  Electronic/
    track.mp4
```

Genre names must exactly match what gets stored in `stations.genres` — the server reads folder names and the vote page reads `stations.genres`. They must be identical strings.

---

## Running the app

Open two terminals:

**Terminal 1 — file server:**
```bash
node server.mjs "/path/to/Master" "/path/to/Genres"
```

**Terminal 2 — DJ interface:**
```bash
npm run dev
```

Open `http://localhost:5173`. Sign in — a station row is auto-created on first login.

Other commands:
```bash
npm run build       # production build → dist/
npm run typecheck   # tsc type-check without emit
npm run lint        # ESLint
npm run preview     # serve the production build locally
```

---

## Audience voting

Share your vote URL:
```
http://your-public-ip:5173/vote/your-station-slug
```

Or once deployed:
```
https://your-domain.com/vote/your-station-slug
```

The slug is auto-generated on first login from your user ID. There is currently no UI to edit it — change it directly in the Supabase `stations` table until a station management UI is built.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Lucide icons |
| Routing | React Router v7 |
| Backend / DB | Supabase (PostgreSQL, Auth, Realtime) |
| File server | Node.js `server.mjs`, `music-metadata` for album art |
| Payments (planned) | Stripe (subscriptions + vote purchases) |

---

## Coder's guide — what to build next

### 🔴 Fix now — these are live bugs

**1. `hourly_vote_result` missing `station_id` in queries**
The migration added the `station_id` column. Now update the code:
- `PlayerPage.tsx` → `tallyAndSwitch()`: add `station_id: station.id` to the INSERT into `hourly_vote_result`.
- `VotePage.tsx` → `fetchWinner()`: add `.eq('station_id', stationId)` to the SELECT from `hourly_vote_result`.
- The fallback path in `tallyAndSwitch` (no station) can keep the unfiltered query as a legacy fallback.

**2. Tally still uses count, not weight**
The `weight` column exists in the DB. The tally in `PlayerPage.tsx` → `tallyAndSwitch()` still does:
```ts
tally[v.value] = (tally[v.value] || 0) + 1;
```
Change the SELECT to include `weight` and sum it:
```ts
tally[v.value] = (tally[v.value] || 0) + v.weight;
```

**3. Silent errors on VotePage**
Vote failures and song request failures are caught but not shown. The UI stays in a "submitted" state. Add an error state with a user-visible message.

---

### 🟡 Core features still to build

**4. Paid voting — Stripe integration**

The full paid voting flow:
1. Audience selects a paid vote tier on `VotePage` (e.g. "5 votes for $1").
2. Client calls a Supabase Edge Function (or your own API) to create a Stripe Checkout session.
3. On successful payment, the Edge Function inserts the vote with `weight = N` into the `votes` table.
4. The vote page shows the weighted tally in real time.

Key decision: vote weight is set server-side after payment confirmation — never trust the client to set `weight`.

**5. Duration-based genre switching**

`duration_minutes` is stored on each vote (60/120/180). The current tally ignores it — winning genre always plays for exactly one hour. To implement:
- Weighted average or highest-voted duration determines how long the genre plays.
- Schedule the next genre switch at `now + duration_minutes` instead of `msUntilNextHour()`.
- This changes the scheduling logic in `PlayerPage.tsx` → `scheduleHourlyCheck`.

**6. Station management UI**

DJs need to be able to:
- Set/edit their station name and slug (slug appears in audience vote URL — should be memorable).
- See their `file_server_url` setting and update it if they run the file server on a non-default port.
- Manage subscription / billing (link to Stripe customer portal).

Suggested route: `/settings` (auth required).

**7. Subscription gate**

Once Stripe is set up:
- On login, fetch the user's row from `subscriptions`.
- If `status !== 'active'` and `tier !== 'owner'`, block access to `PlayerPage` and redirect to a paywall/upgrade screen.
- The `subscriptions` row is created by the Stripe webhook after purchase — do not let users create it themselves.

**8. Stripe webhook handler**

A Supabase Edge Function that:
- Receives `customer.subscription.created`, `updated`, `deleted` events from Stripe.
- Upserts into `subscriptions` with correct `tier`, `status`, `current_period_end`.
- Uses the Stripe webhook secret to verify the request.

---

### 🟢 Polish and quality of life

**9. Auto-connect to file server on page load**
Currently the DJ must click "Connect" after loading the page. For "set it and forget it", call `loadFromServer()` automatically when the page mounts (after station is loaded). Gate it on `checkServer()` succeeding so the UI degrades gracefully if the file server isn't running.

**10. No DB unique constraint on votes**
Client-side dedup via `localStorage` is easy to bypass. Add a partial unique index:
```sql
CREATE UNIQUE INDEX votes_one_free_per_token_per_hour
  ON votes (voter_token, station_id, hour_key)
  WHERE weight = 1;
```
Paid votes (weight > 1) can appear multiple times from the same token in the same hour — each paid transaction is a separate vote row.

**11. `stations.updated_at` not auto-updating**
Add a Supabase `moddatetime` trigger, or manually include `updated_at: new Date().toISOString()` in every station UPDATE call.

**12. No password reset or email confirmation flow**
`LoginPage` handles sign-up but not verification or password reset. Whether this matters depends on your Supabase project's email settings. If email confirmation is enabled, users who sign up land back on login with no feedback. Add `supabase.auth.resetPasswordForEmail()` and handle the `PASSWORD_RECOVERY` auth event.

**13. Station slug editing**
The slug is derived from the user's UUID on first login — not memorable. Let the DJ set a custom slug in the settings UI (unique constraint is already on the `stations.slug` column).

---

## Key implementation notes

These are the non-obvious things that will burn time if you don't know them upfront.

### ⚠️ The HTTPS / mixed-content landmine (most important for SaaS)

The file server (`server.mjs`) runs over plain HTTP on the DJ's machine. If the React app is served from an HTTPS domain (which any public SaaS deployment will be), the browser will block all requests from the app to `http://localhost:3001` as "mixed content."

**This means the hosted SaaS and the local file server cannot talk to each other from a browser on HTTPS.**

Practical solutions (pick one before building the SaaS side):

| Option | Tradeoff |
|---|---|
| **Run the DJ app locally** (`npm run dev`) — not hosted on HTTPS | Works perfectly. Each subscriber downloads and runs the app locally. Authentication still goes through Supabase. No mixed-content issue. The vote page is the only thing that needs to be publicly hosted. |
| **Electron / Tauri wrapper** | Packages the whole app as a desktop app. No browser mixed-content restrictions. Bigger distribution effort. |
| **Local HTTPS proxy** (e.g. Caddy, nginx with self-signed cert) | Subscriber runs a local reverse proxy that adds HTTPS to port 3001. Complex UX. |
| **Cloudflare Tunnel or ngrok** | Subscriber exposes their local file server to a public HTTPS URL. Security/privacy concerns. |

**Recommended path:** Keep the DJ interface as a locally-run app for now. Serve only the vote page publicly. This is the simplest path, sidesteps the browser security model completely, and still supports the full SaaS model (each subscriber logs in with their own account, their subscription is checked against Supabase, they keep their files local).

### How file IDs work

File IDs are `base64url`-encoded absolute paths on the DJ's machine. The server generates them in `/tracks` responses, decodes them in `/file/:id` and `/cover/:id`. Never construct or store these IDs outside of a server response — they are opaque tokens tied to the specific machine's filesystem.

### Auto station creation

`PlayerPage` calls `ensureStation()` on mount (after auth). It upserts to the `stations` table keyed by `owner_id`. If no station exists, it creates one with a slug derived from the user's UUID. This runs once per page load — no separate "create station" UI.

### Genre list sync

`PlayerPage` calls `GET /genres` to get subfolder names, then writes the array to `stations.genres`. The vote page reads `stations.genres` to populate genre buttons. **Genre names must exactly match subfolder names** — including capitalisation.

### `file_server_url` in station settings

`server.mjs` URL is now read from `import.meta.env.VITE_FILE_SERVER_URL` with fallback `http://localhost:3001`. For SaaS subscribers who run the file server on a different port, they can set `VITE_FILE_SERVER_URL` in their local `.env`. Eventually this should be settable per-station via the settings UI (it's a column on `stations` now).

### Supabase Realtime subscriptions

Both `DJPanel` and `VotePage` subscribe to `INSERT` events on `votes`. The channel is cleaned up in `useEffect` return. Realtime must be enabled on the `votes` table in Supabase (Database → Replication) or live tallies won't update.

### UTC everywhere

All time utilities are in `src/lib/time.ts`. They are all UTC. Do not use local-time methods (`getHours`, `setHours`, `setMinutes`) for anything related to the hourly vote cycle. Use `getUTCHours`, `setUTCHours`, `setUTCMinutes`.

### OBS setup for the DJ

1. OBS → Sources → Add → Browser Source
2. URL: `http://localhost:5173`
3. Width/Height: match your stream resolution (1920×1080 or 1280×720)
4. Check "Shutdown source when not visible" (saves resources)
5. The player UI has a dark/transparent aesthetic designed for this use case — don't wrap it in opaque containers.

### Playback config persistence

Play order (random/sequential) and loop mode (loop/once) are persisted to `stations.playback_config` (jsonb) whenever changed in `DJPanel`. They are restored from Supabase on page mount via `ensureStation`. The React state always mirrors the database.
