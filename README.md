# RadioDJ

Internet radio automation for DJs. Play music from your local files, let your audience vote on what to hear next, and manage everything from a single dashboard.

## Features

- **DJ dashboard** — sign in, manage your station, control playback, and see live audience votes
- **Audience voting page** — viewers vote for genres or request songs each hour at `/vote/:slug`
- **Hourly vote tally** — votes are bucketed per UTC hour; the winning genre auto-switches at the top of the next hour
- **DJ override** — force a genre switch immediately or queue one after the current song
- **Local media server** — serves audio, video, and image files from your machine (no uploads required)
- **Drag-and-drop** — drop local files directly into the browser for quick testing
- **OBS-ready** — designed to run as a 1280×720 Browser Source with "Monitor and Output" audio
- **Realtime** — vote counts update live via Supabase Realtime subscriptions

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router v7 |
| Local server | Node.js (native `http` module), `music-metadata` for cover art |
| Database | Supabase (Postgres) with Row-Level Security |
| Auth | Supabase Auth (email/password) |
| Icons | lucide-react |

## Prerequisites

- Node.js >= 18
- npm
- A Supabase project ([supabase.com](https://supabase.com))
- (Optional) Local music folders organized as described below

## Environment Variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

These are consumed at build time by Vite via `import.meta.env`.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase (database + auth)

1. Create a Supabase project and copy its URL and anon key into `.env`.
2. Enable **Email Auth** in the Supabase Auth settings.
3. Run the three migrations against your Supabase database. Migrations are located in `supabase/migrations/` and must be applied in chronological order:

   - `20260513103324_create_hourly_vote_result.sql` — creates the `hourly_vote_result` table for genre winners
   - `20260618164706_create_stations_and_votes.sql` — creates `stations` and `votes` tables with RLS policies
   - `20260717231138_add-station-id-to-hourly-vote-result.sql` — adds a `station_id` foreign key to `hourly_vote_result` and replaces the index with a station-scoped composite index

   These can be applied through the Supabase Dashboard SQL Editor, the Supabase CLI (`supabase db push`), or any Postgres client.

4. **Enable Realtime** for the `votes` table in your Supabase project:
   - Go to **Database → Replication** in the Supabase Dashboard
   - Ensure the `votes` table has Realtime enabled (needed for live vote tally updates on both the DJ panel and the audience voting page)

### 3. Local media server

RadioDJ plays files from your local machine via a bundled Node.js server. Two folder arguments are supported:

- **Arg 1 (master folder)** — flat directory of audio/video files (no subfolders). Used as the fallback source.
- **Arg 2 (genre folder)** — directory whose immediate subfolders are genre names (e.g. `Rock/`, `Jazz/`, `Hip Hop/`). Each subfolder can contain files at any depth.

```bash
node server.mjs /path/to/master /path/to/genres
```

The server runs on `http://localhost:3001` and serves:
- `GET /status` — health check
- `GET /genres` — list genre subfolder names
- `GET /tracks?genre=Rock` — list tracks for a genre (omit `?genre` or use `master` for the master folder)
- `GET /file/:id` — stream a file with range support
- `GET /cover/:id` — extract embedded album art

## Run

```bash
# Terminal 1 — local media server
node server.mjs ~/Music/All ~/Music/Genres

# Terminal 2 — Vite dev server
npm run dev
```

Open the Vite URL (default `http://localhost:5173`), sign up, and click **Connect to local server** on the dashboard.

## Routes

| Path | Page | Access |
|------|------|--------|
| `/` | PlayerPage — DJ dashboard with playback controls and DJ panel | Authenticated |
| `/login` | LoginPage — sign in / create account | Public |
| `/vote/:slug` | VotePage — audience voting for a specific station | Public |
| `/vote` | VotePage — falls back to the first station by creation date | Public |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |

## Project Layout

```
├── server.mjs                  # Local media server (Node.js, port 3001)
├── supabase/migrations/        # 3 SQL migration files
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Router + auth gate
│   ├── pages/
│   │   ├── PlayerPage.tsx      # DJ dashboard (authenticated)
│   │   ├── VotePage.tsx        # Public audience voting page
│   │   └── LoginPage.tsx       # Sign in / sign up
│   ├── hooks/
│   │   ├── usePlaybackController.ts  # Audio/video playback state machine
│   │   ├── useVoteScheduler.ts       # Hourly tally, genre switching, countdown
│   │   ├── useVoteSubscription.ts    # Realtime INSERT subscription on votes
│   │   ├── useStation.ts             # Station CRUD and playback config
│   │   └── useCountdown.ts           # Generic countdown timer
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client instance
│   │   ├── voteService.ts       # Vote fetch/submit/tally helpers
│   │   ├── localServerClient.ts # HTTP client for the local media server
│   │   ├── playerUtils.ts       # Pure helpers (time, shuffle, UTC hour)
│   │   └── types.ts             # Shared TypeScript interfaces
│   └── components/
│       ├── DJPanel.tsx          # DJ override/votes/requests/playback config
│       ├── player/              # Player UI (NowPlaying, QueueSidebar, etc.)
│       └── ui/                  # Reusable UI kit (Brand, Spinner, etc.)
```

## Voting Behavior

- Votes are bucketed by **UTC hour** using a `hour_key` string in `YYYY-MM-DD-HH` format.
- At each hour boundary, the DJ's station tallies the previous hour's genre votes, writes the winner to `hourly_vote_result`, and switches the play source if the winner differs from the current source.
- Ties are broken alphabetically.
- All vote operations are **scoped to a station** via `station_id`. Each station reads and writes its own data independently.
- The audience page receives live vote tally updates through a Supabase Realtime subscription on the `votes` table (filtered by `station_id`).
- A per-voter token stored in `localStorage` identifies unique voters (no authentication required for voting).

## Limitations

- **No test suite** — the project has no test files, runners, or test infrastructure configured.
- The local media server binds to `127.0.0.1:3001` and is intended for local-network use only. It has no authentication or HTTPS.
- Playback relies on browser media element support for codec availability.
