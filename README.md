# RadioDJ — Personal Internet Radio Station

A self-hosted internet radio station. You DJ from your own music library; your audience votes on what genre to play next.

---

## Table of Contents

- [How it works](#how-it-works)
- [Architecture](#architecture)
- [File structure](#file-structure)
- [Database schema](#database-schema)
- [Development setup](#development-setup)
- [Running the app](#running-the-app)
- [Audience voting](#audience-voting)
- [Tech stack](#tech-stack)
- [Known issues — coder's TODO list](#known-issues--coders-todo-list)
- [Key implementation notes](#key-implementation-notes)

---

## How it works

Two things run on the DJ's machine:

1. **Local file server** (`server.mjs`, port 3001) — serves MP3/WAV/MP4 files from disk with range-request support and embedded album art extraction.
2. **DJ interface** (React app, port 5173) — the control panel and media player; designed to be captured by OBS as a browser source for streaming.

The audience visits a public vote page at `/vote/<station-slug>` (hosted anywhere with internet access to Supabase). They pick a genre each hour. At the top of the hour the DJ player tallies votes, writes the winner to the database, and switches to that genre's folder after the current track ends.

```
[Music folders on disk]
        │
   server.mjs :3001
        │  HTTP (localhost only)
        ▼
  PlayerPage (React)  ──── OBS browser source ──── Stream (YouTube/Twitch/Kick)
        │  read/write
        ▼
     Supabase
        │  realtime
        ▼
  VotePage (public URL — audience on any device)
```

---

## Architecture

### Routes

| Route | Auth required | Component | Purpose |
|---|---|---|---|
| `/` | Yes | `PlayerPage` | DJ control panel + media player |
| `/login` | No | `LoginPage` | Email/password sign-in and sign-up |
| `/vote/:slug` | No | `VotePage` | Public audience voting page |
| `/vote` | No | `VotePage` | Same — picks first station if no slug |
| `/help` | No | `HelpPage` | In-app user manual |
| `*` | — | — | Redirects to `/` |

### Hourly vote cycle

```
Audience submits vote
  → INSERT into votes (station_id, vote_type='genre', value, voter_token, hour_key)

At top of hour (PlayerPage timer):
  → SELECT votes WHERE station_id = ? AND hour_key = current_hour GROUP BY value
  → Pick genre with most votes (tie-break: first alphabetically)
  → INSERT into hourly_vote_result (hour_start, genre)
  → Set pendingGenre in React state

On current track ending:
  → GET /tracks?genre=<winner> from server.mjs
  → Load new queue, start playback
```

### Vote deduplication

Client-side only: a `voter_token` UUID is stored in `localStorage` and sent with every vote. One `(voter_token, station_id, hour_key)` combo is counted once on the client. **There is no database unique constraint** — the enforcement is purely in the browser.

---

## File structure

```
/workspace
├── index.html                   # App shell; title + OG meta still say "Bolt" — update
├── server.mjs                   # Local file server (Node, no bundler)
├── package.json
├── vite.config.ts               # No dev proxy to :3001; SERVER const is hardcoded
├── tailwind.config.js
├── tsconfig.app.json
├── .env                         # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (not in git)
│
├── supabase/
│   └── migrations/
│       ├── 20260513103324_create_hourly_vote_result.sql   # global winner mailbox
│       └── 20260618164706_create_stations_and_votes.sql   # stations + votes tables
│
└── src/
    ├── main.tsx                 # React entry point
    ├── App.tsx                  # BrowserRouter, auth state, RequireAuth guard
    ├── index.css                # Tailwind directives only
    ├── vite-env.d.ts
    │
    ├── lib/
    │   ├── supabase.ts          # Supabase client (single export: `supabase`)
    │   └── types.ts             # Shared TypeScript interfaces and union types
    │
    ├── components/
    │   └── DJPanel.tsx          # Slide-down panel (4 tabs: Override, Votes, Requests, Playback)
    │
    └── pages/
        ├── PlayerPage.tsx       # ~1030 lines — main DJ player; all playback + hourly tally logic
        ├── VotePage.tsx         # ~472 lines — public genre voting + song requests + live tallies
        ├── LoginPage.tsx        # Email/password auth via Supabase
        └── HelpPage.tsx         # ~595 lines — in-app user manual (no Supabase calls)
```

### What lives where

- **All playback state** lives in `PlayerPage`. No custom hooks have been extracted yet — the component is large but self-contained.
- **Vote submission + realtime** lives in `VotePage`. It also reads `hourly_vote_result` to show the currently-playing genre.
- **Override controls, live tally display, playback settings** live in `DJPanel`; it receives callbacks and state from `PlayerPage` via props.
- **Types** shared across pages live in `src/lib/types.ts`.
- **Utility helpers** (`getHourKey`, `formatCountdown`, `msUntilNextHour`) are duplicated across `PlayerPage`, `DJPanel`, and `VotePage` — they have not been moved to a shared module yet.

---

## Database schema

Run both migration files in `supabase/migrations/` in chronological order via the Supabase SQL editor.

### `stations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `owner_id` | uuid FK → auth.users | cascade delete |
| `name` | text | display name |
| `slug` | text UNIQUE | used in `/vote/:slug` URL |
| `genres` | text[] | synced from `GET /genres` on the file server |
| `playback_config` | jsonb | `{ order: 'random'|'sequential', loop: 'loop'|'once' }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | not auto-updated (no trigger) |

RLS: public SELECT; owner INSERT/UPDATE/DELETE.

### `votes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `station_id` | uuid FK → stations | cascade delete |
| `vote_type` | text | `'genre'` or `'song'` |
| `value` | text | genre name or song title |
| `duration_minutes` | int | 60/120/180 — stored but **not yet used in tally logic** |
| `voter_token` | text | UUID from audience browser `localStorage` |
| `hour_key` | text | UTC bucket e.g. `"2026-06-19T14"` |
| `created_at` | timestamptz | |

RLS: public SELECT and INSERT (intentionally open for unauthenticated audience).

### `hourly_vote_result`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | auto |
| `hour_start` | timestamptz | top-of-hour UTC timestamp |
| `genre` | text nullable | winning genre; NULL = fall back to master folder |
| `created_at` | timestamptz | |

RLS: anon SELECT and INSERT. **No `station_id`** — currently a single global mailbox shared by all stations. Multi-station support requires adding this column and migrating queries.

---

## Development setup

### 1. Prerequisites

- Node.js LTS
- A [Supabase](https://supabase.com) project (free tier is fine)

### 2. Clone and install

```bash
npm install
```

### 3. Environment variables

Create a `.env` file in the project root (already in `.gitignore`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Both values are in your Supabase project → Settings → API.

### 4. Run migrations

Open the Supabase SQL editor and run each file in `supabase/migrations/` in chronological (filename) order.

### 5. Organise your music folders

**Master folder** — flat directory, all songs as fallback:
```
/Music/Master/
  song1.mp3
  song2.wav
```

**Genre folder** — one subfolder per genre (folder name = genre name that audiences vote on):
```
/Music/Genres/
  Rock/
    song.mp3
  Jazz/
    song.mp3
  Electronic/
    song.mp3
```

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

Open `http://localhost:5173`. Sign up/log in — a station row is auto-created in Supabase on first login.

Other useful commands:
```bash
npm run build       # production build → dist/
npm run typecheck   # tsc type-check without emit
npm run lint        # ESLint
npm run preview     # serve the production build locally
```

---

## Audience voting

Share your vote URL with your audience:

```
http://your-public-ip:5173/vote/your-station-slug
```

The slug is auto-generated from your Supabase user ID on first login. You can find it in the Supabase `stations` table. There is currently no UI to edit it.

Votes are tallied at the top of every hour and the player switches to the winning genre after the current track finishes.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Lucide icons |
| Routing | React Router v7 |
| Backend / DB | Supabase (PostgreSQL, Auth, Realtime) |
| File server | Node.js (`server.mjs`), `music-metadata` for album art |

---

## Known issues — coder's TODO list

These are confirmed bugs and missing features, roughly in priority order.

### 🔴 High priority

**1. `hourly_vote_result` has no `station_id`**
The table is a single global mailbox. If two stations run simultaneously the wrong genre plays for both. Fix: add `station_id uuid REFERENCES stations(id)` column, update the INSERT in `PlayerPage.tsx` (`fetchAndTallyVotes`), update the SELECT in `VotePage.tsx` (`fetchWinner`), and write a migration.

**2. Timezone mismatch in hourly scheduling (PlayerPage)**
`getHourKey()` uses UTC (correct) but `msUntilNextHour()` and `currentHourStart()` in `PlayerPage.tsx` use **local time** (`new Date().setHours(...)`) instead of UTC (`setUTCHours`). VotePage uses UTC correctly. This causes the tally to fire at the wrong moment in non-UTC timezones. Fix: replace `setHours`/`getHours` with `setUTCHours`/`getUTCHours` in the PlayerPage helpers.

**3. `VotePage.fetchWinner()` ignores `station_id`**
The query for the currently-playing genre in `VotePage.tsx` selects from `hourly_vote_result` without filtering by station. Until issue #1 is fixed this returns the global result regardless of which station's page you're on.

### 🟡 Medium priority

**4. Vote deduplication is client-only**
There is no `UNIQUE (voter_token, station_id, hour_key)` constraint in the database. Anyone can POST directly to Supabase and submit unlimited votes. Add the unique constraint in a migration (or at minimum a partial index), and add a DB-level check.

**5. `duration_minutes` is stored but never used**
Audience members pick 1/2/3 hour duration when voting, but the tally logic in `PlayerPage.tsx` ignores it — all votes count equally regardless. Decide intended behavior (weight by duration, or extend the active genre window) and implement it.

**6. Silent errors on VotePage**
Vote submit failures and song request failures do not show any feedback to the user. The error is caught but the UI stays in a "submitted" state. Add visible error messaging.

**7. Utility helpers are duplicated in three files**
`getHourKey`, `formatCountdown`, and `msUntilNextHour` appear in `PlayerPage.tsx`, `DJPanel.tsx`, and `VotePage.tsx`. Extract to `src/lib/time.ts`.

### 🟢 Low priority / polish

**8. `SERVER` is hardcoded to `http://localhost:3001`**
In `PlayerPage.tsx` line 19: `const SERVER = 'http://localhost:3001'`. This works for local dev only. For any deployment variation (custom port, remote machine) the user must edit source. Move to an env variable: `VITE_FILE_SERVER_URL`.

**9. `index.html` has stale Bolt.new meta**
`<title>` says "Online Radio Music Automation". OG image and twitter card tags reference `bolt.new`. Update to match the RadioDJ brand.

**10. Missing `public/` folder and `vite.svg`**
`index.html` references `/vite.svg` as favicon which 404s. Add a real favicon or remove the reference.

**11. `cors` npm package is unused**
`package.json` lists `cors` as a dependency but `server.mjs` implements CORS manually. Remove it.

**12. No station management UI**
There is no screen to rename your station or edit its slug after creation. The slug is used in audience-facing URLs so DJs need a way to set a memorable one.

**13. `stations.updated_at` has no auto-update trigger**
The column exists but is never updated by Supabase automatically. Add a `moddatetime` trigger or update it manually in UPDATEs.

**14. No email confirmation / password reset in LoginPage**
`LoginPage.tsx` handles sign-up but not email verification flow or password reset. These may not matter depending on Supabase project settings (email confirmation can be disabled).

**15. No Supabase Realtime replication setup note**
For `VotePage` live tallies to work, Supabase replication must be enabled on the `votes` table (Database → Replication → toggle the table). This is not mentioned anywhere in setup docs.

---

## Key implementation notes

These are things that are easy to get wrong when touching the code.

### `server.mjs` — how file IDs work

File IDs sent between the file server and the React app are `base64url`-encoded absolute paths. The server encodes them on `/tracks`, decodes them on `/file/:id` and `/cover/:id`. Never construct or store these IDs on the frontend — always get them from the server's response.

### Auto station creation

When `PlayerPage` mounts and a user is logged in, it calls `ensureStation()` which does an upsert on the `stations` table keyed by `owner_id`. If no station exists it creates one with a slug derived from the user's UUID. This runs once per mount — no dedicated "create station" flow.

### Genre list sync

`PlayerPage` calls `GET /genres` on the file server to get the list of genre subfolder names, then writes that array to `stations.genres` in Supabase. The vote page reads `stations.genres` to populate the voting buttons. Genre names must exactly match subfolder names on disk.

### Supabase Realtime subscription (DJPanel + VotePage)

Both `DJPanel` and `VotePage` subscribe to `INSERT` events on the `votes` table. The channel is cleaned up in `useEffect` return. If you add columns to `votes` make sure the subscription payload includes them (Supabase sends the full row by default unless you filter).

### OBS usage

`PlayerPage` is designed to be loaded as an OBS browser source. The UI has a transparent/dark background and overlays intended to be visible on stream. Don't add opaque background wrappers that would break the OBS overlay appearance.

### `playback_config` in Supabase

Playback settings (random/sequential, loop/once) are persisted to `stations.playback_config` (a `jsonb` column) whenever the DJ changes them in `DJPanel`. They are loaded back on mount via `ensureStation`. The local React state always matches what is in the database.
