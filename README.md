# RadioDJ — Personal Internet Radio Station

A self-hosted internet radio station. You DJ from your own music library; your audience votes on what genre to play next.

## How it works

Two things run on your computer:

1. **Local file server** (`server.mjs`, port 3001) — serves your MP3/WAV/MP4 files
2. **DJ interface** (React app, port 5173) — your control panel

Your audience visits your public voting page at `/vote/your-station-slug` and votes on a genre each hour. The player automatically switches to the winning genre at the top of the hour.

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org) (LTS)
- A [Supabase](https://supabase.com) project (free tier works)

### 2. Configure Supabase

Create a `.env` file in the project root:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the SQL migrations in `supabase/migrations/` against your Supabase project (via the Supabase SQL editor).

### 3. Install dependencies
```bash
npm install
```

### 4. Organise your music folders

**Master folder** — one flat folder with all your songs (fallback when no genre wins)
```
/Music/Master/
  song1.mp3
  song2.wav
```

**Genre folder** — one subfolder per genre
```
/Music/Genres/
  Rock/
    song.mp3
  Jazz/
    song.mp3
  Electronic/
    song.mp3
```

### 5. Run

Open two terminals:

**Terminal 1 — file server:**
```bash
node server.mjs "/path/to/Master" "/path/to/Genres"
```

**Terminal 2 — DJ interface:**
```bash
npm run dev
```

Open `http://localhost:5173` — log in and start your station.

## Audience voting

Share your vote URL with your audience:
```
http://your-public-ip:5173/vote/your-station-slug
```

Votes are tallied at the top of every hour and the DJ player switches to the winning genre automatically.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS + Lucide icons
- Supabase (auth + real-time voting database)
- Node.js file server with `music-metadata` for album art extraction
