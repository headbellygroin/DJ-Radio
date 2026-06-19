# RadioDJ — Subscriber Setup Guide

Welcome. This gets you from zero to a live radio stream in about 15 minutes.

---

## What you need

| Tool | Cost | Link |
|---|---|---|
| Node.js LTS | Free | [nodejs.org](https://nodejs.org) |
| OBS Studio | Free | [obsproject.com](https://obsproject.com) |
| A RadioDJ subscription | Paid | Your welcome email has the link |

That's it. No servers to rent. No uploads. Your music stays on your computer.

---

## Step 1 — Download the app

**Option A — if you have Git:**
```bash
git clone https://github.com/headbellygroin/DJ-Radio.git
cd DJ-Radio
npm install
```

**Option B — download ZIP:**
1. Go to [github.com/headbellygroin/DJ-Radio](https://github.com/headbellygroin/DJ-Radio)
2. Click the green "Code" button → "Download ZIP"
3. Unzip, open the folder in a terminal
4. Run `npm install`

---

## Step 2 — Create your .env file

Create a file called `.env` in the DJ-Radio folder (same level as `package.json`).

Copy and paste this, using the values from your welcome email:

```
VITE_SUPABASE_URL=https://[FROM YOUR WELCOME EMAIL]
VITE_SUPABASE_ANON_KEY=[FROM YOUR WELCOME EMAIL]
VITE_FILE_SERVER_URL=http://localhost:3001
```

These credentials are specific to the RadioDJ platform — do not change them. Your music and settings are stored privately under your account.

---

## Step 3 — Organise your music

You need two folder locations. They can be anywhere on your computer.

**Master folder** — contains all your songs as a flat list (no subfolders). This plays as the fallback when no genre wins the vote.

```
/Music/Master/
  song1.mp3
  song2.mp3
  mix.wav
```

**Genres folder** — contains one subfolder per genre. The folder names are exactly what your audience will vote on.

```
/Music/Genres/
  Pop/
    track1.mp3
    track2.mp3
  Rock/
    track3.mp3
  Hip-Hop/
    track4.mp3
  Chill/
    instrumental.mp3
```

Supported file types: `.mp3`, `.wav`, `.m4a`, `.flac`, `.mp4`, `.webm`, `.mov`

---

## Step 4 — Start the file server

Open a terminal in the DJ-Radio folder and run (adjust the paths to where your music is):

**Mac / Linux:**
```bash
node server.mjs "/Users/yourname/Music/Master" "/Users/yourname/Music/Genres"
```

**Windows:**
```bash
node server.mjs "C:\Music\Master" "C:\Music\Genres"
```

You should see:
```
RadioDJ file server running on http://localhost:3001
  Master: /Users/yourname/Music/Master  (247 files)
  Genres: /Users/yourname/Music/Genres  (Rock, Jazz, Pop, ...)
```

Leave this terminal running. Do not close it while streaming.

---

## Step 5 — Start the player

Open a **second terminal** in the DJ-Radio folder:

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser. Log in with your RadioDJ account.

The player will auto-connect to your file server and load your music library.

---

## Step 6 — Set up OBS

1. Open OBS Studio
2. In the **Sources** panel, click `+` → **Browser Source**
3. Give it a name (e.g. "RadioDJ Player")
4. Set URL to: `http://localhost:5173`
5. Set Width: `1920` and Height: `1080` (or your stream resolution)
6. Click OK

The player now appears as a layer in OBS. You can resize/reposition it like any other source.

**To stream:**
- OBS → Settings → Stream → enter your stream key for YouTube, Rumble, or Kick
- Click **Start Streaming**

To stream to multiple platforms at once, use [Restream.io](https://restream.io) as a single stream destination in OBS, or the OBS `obs-multi-rtmp` plugin.

---

## Step 7 — Share your vote page

Your audience votes at:
```
https://radiodj.com/vote/YOUR-SLUG
```

Your slug is shown in the DJ panel (the tab bar at the top of the player). Share this link in your stream chat, bio, social media, etc.

---

## How voting works

- Audience gets **one free vote per hour**.
- They can **buy vote packs** to have their vote count as more — e.g. 5 votes for $1.
- At the top of each hour, the genre with the most votes (weighted) starts playing automatically.
- If nobody votes, the player falls back to your Master folder.

---

## Troubleshooting

**"Cannot connect to file server" in the player**
Make sure Step 4 is still running in the background. The terminal must stay open.

**No genres showing in the player**
Check that your Genres folder has subfolders with actual music files in them. Subfolders must not be empty.

**Player shows "Login required"**
You're opening the app from the hosted website. Always use `http://localhost:5173` (not the radiodj.com URL) for the player.

**Login not working**
Double-check your `.env` file has the correct values from your welcome email. The file must be named `.env` (not `.env.txt`).

**Music plays but OBS shows a black screen**
In OBS, right-click the browser source → Refresh. Make sure "Hardware Acceleration" is enabled in OBS browser source settings.

**Songs sound out of sync after a long stream**
Restart the `npm run dev` terminal and refresh the OBS browser source.

---

## Tips

- You don't need to do anything once the stream is running — it switches genres automatically.
- Add your vote page URL to your stream's "About" section on YouTube/Rumble/Kick so viewers can find it.
- Genre folder names appear exactly as-named on the vote page. Use proper capitalisation (e.g. "Hip-Hop" not "hiphop").
- The player can mix audio and video files. Drop `.mp4` files in a genre folder and they'll play as video.
- You can drag-and-drop local files directly into the player for one-off additions without adding them to your folders.
