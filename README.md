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
- **Realtime** — vote counts update live via polling of aggregated vote RPCs (Supabase Realtime is not used, because raw vote rows are not publicly readable)

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
3. The database schema and security policies are already applied to the provisioned Supabase project. If you are setting up your own project, apply the migrations in `supabase/migrations/` in chronological order through the Supabase Dashboard SQL Editor or any Postgres client.

   Key security notes for a self-managed project:
   - **Votes are never directly inserted or read as raw rows by the frontend.** Vote submission goes through the `submit_vote` SECURITY DEFINER RPC, which validates the station, genre, voter token, and current UTC hour before inserting.
   - **Aggregated vote data** (genre tallies and the current hourly winner) is exposed through `get_genre_tallies` and `get_current_winner` RPCs, callable by anyone.
   - **Song requests** are only readable by the authenticated station owner via `get_song_requests`.
   - **Stations and hourly results** are owner-scoped via RLS; the public only sees station name, slug, and genres through `get_public_station`.
   - Do **not** enable Realtime on the `votes` table — raw per-voter rows are intentionally not exposed to any role.

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
├── supabase/migrations/        # SQL migration files (already applied to the provisioned project)
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
│   │   ├── useVoteSubscription.ts    # Polls aggregated vote RPCs every 10s (no Realtime)
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
- The audience page receives live vote tally updates by polling the `get_genre_tallies` and `get_current_winner` RPCs every 10 seconds (no Realtime subscription, because raw vote rows are not publicly readable).
- A per-voter token stored in `localStorage` identifies unique voters (no authentication required for voting). One vote per voter per hour per vote type is enforced by a unique database index.

## Limitations

- **No test suite** — the project has no test files, runners, or test infrastructure configured.
- The local media server binds to `127.0.0.1:3001` and is intended for local-network use only. It has no authentication or HTTPS.
- Playback relies on browser media element support for codec availability.
