import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio, Server, Monitor, Users, Settings, ChevronDown, ChevronRight,
  Music2, HardDrive, Vote, Mic2, Clock, Shuffle, Repeat, LogIn,
  Terminal, Globe, ArrowLeft, ExternalLink, AlertCircle, CheckCircle,
  Play, SkipForward, Volume2, Folder,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

interface FAQProps {
  q: string;
  children: React.ReactNode;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ id, icon, title, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-20 mb-12">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-white/8">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/50 flex-shrink-0">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-white/60 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function FAQ({ q, children }: FAQProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.03] transition-colors"
      >
        <span>{q}</span>
        {open ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-sm text-white/50 leading-relaxed border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="inline-block font-mono text-[12px] bg-black/40 text-white/70 px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function Block({ children }: { children: string }) {
  return (
    <pre className="font-mono text-[12px] bg-black/50 border border-white/5 text-white/60 px-4 py-3 rounded-xl overflow-x-auto leading-relaxed">
      {children}
    </pre>
  );
}

function Callout({ type, children }: { type: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2.5 px-4 py-3 rounded-xl border text-sm ${
      type === 'info'
        ? 'bg-blue-500/5 border-blue-500/15 text-blue-300/70'
        : 'bg-amber-500/5 border-amber-500/15 text-amber-300/70'
    }`}>
      {type === 'info'
        ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
        : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}

// ─── Nav items ───────────────────────────────────────────────────────────────

const NAV = [
  { id: 'overview',   label: 'Overview'          },
  { id: 'prereqs',    label: 'Prerequisites'      },
  { id: 'setup',      label: 'First-time setup'   },
  { id: 'player',     label: 'Using the player'   },
  { id: 'votepage',   label: 'Audience vote page' },
  { id: 'djpanel',    label: 'DJ control panel'   },
  { id: 'playback',   label: 'Playback modes'     },
  { id: 'obs',        label: 'OBS setup'          },
  { id: 'techspecs',  label: 'Technical specs'    },
  { id: 'faq',        label: 'FAQ'                },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#080a0e] text-white" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#080a0e]/95 backdrop-blur px-6 py-4 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} />
          Back to player
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
            <Radio size={11} />
          </div>
          <span className="font-semibold text-sm">RadioDJ — User Manual</span>
        </div>
        <button
          onClick={() => setMobileNavOpen((s) => !s)}
          className="ml-auto lg:hidden text-white/40 hover:text-white transition-colors text-xs border border-white/10 px-3 py-1.5 rounded-lg"
        >
          Sections
        </button>
      </header>

      <div className="flex max-w-6xl mx-auto">

        {/* Sidebar nav — desktop */}
        <nav className="hidden lg:block w-52 flex-shrink-0 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto px-4 py-8">
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => scrollTo(n.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-[13px] text-white/35 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-x-0 top-[57px] z-20 bg-[#0d0f14] border-b border-white/5 px-6 py-4">
            <div className="grid grid-cols-2 gap-1">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => scrollTo(n.id)}
                  className="text-left px-3 py-2 rounded-lg text-[13px] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 lg:px-12 py-10 max-w-3xl">

          {/* Hero */}
          <div className="mb-12">
            <h1 className="text-3xl font-bold mb-3">RadioDJ User Manual</h1>
            <p className="text-white/50 leading-relaxed">
              RadioDJ is a 24/7 browser-based stream player that runs on your own hardware, streams to OBS, and lets your audience vote on what plays next — without paying YouTube, Kick, or Twitch for API access.
            </p>
          </div>

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          <Section id="overview" icon={<Radio size={15} />} title="Overview">
            <p>
              RadioDJ has three parts that work together:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
              {[
                { icon: <Server size={16} />, title: 'Local server', body: 'server.mjs runs on your machine and streams your music files to the browser.' },
                { icon: <Monitor size={16} />, title: 'DJ Player', body: 'The browser player you open in OBS. It plays tracks, manages the queue, and talks to Supabase.' },
                { icon: <Users size={16} />, title: 'Vote page', body: 'A public webpage your audience visits to vote on genres and request songs — no YouTube needed.' },
              ].map((c) => (
                <div key={c.title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                  <div className="text-white/40 mb-2">{c.icon}</div>
                  <p className="text-white/80 font-medium text-sm mb-1">{c.title}</p>
                  <p className="text-[12px] text-white/40 leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
            <p>
              The core idea: <strong className="text-white/80">your files never leave your machine.</strong> The local server reads from your hard drive and serves them to the browser. Supabase holds only metadata — genre lists, votes, and hourly results. Your audience interacts with the vote page on your domain; OBS captures the browser player and sends it to YouTube, Kick, or Twitch.
            </p>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 my-3 font-mono text-[12px] text-white/40 leading-loose">
              Your hard drive → server.mjs (port 3001) → Browser player → OBS → YouTube / Kick / Twitch
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↕
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Supabase (votes, stations)
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↕
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Audience vote page (public)
            </div>
          </Section>

          {/* ── PREREQUISITES ────────────────────────────────────────────── */}
          <Section id="prereqs" icon={<CheckCircle size={15} />} title="Prerequisites">
            <p>Before you can use RadioDJ, you need:</p>
            <ul className="space-y-2 my-3">
              {[
                ['Node.js 18+', 'Required to run server.mjs. Download from nodejs.org.'],
                ['OBS Studio', 'Captures the browser player and sends it to your stream platform.'],
                ['Music files', '.mp3, .wav, or .mp4 files organized in folders on your hard drive.'],
                ['A RadioDJ account', 'Free. Create one at the /login page. Needed for the DJ player only.'],
                ['A modern browser', 'Chrome or Edge recommended for OBS Browser Source.'],
              ].map(([name, desc]) => (
                <li key={name} className="flex gap-3">
                  <CheckCircle size={13} className="text-green-500/60 flex-shrink-0 mt-0.5" />
                  <span><strong className="text-white/70">{name}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
            <Callout type="info">
              The vote page is fully public — your audience needs nothing installed. They just open the URL in any browser.
            </Callout>
          </Section>

          {/* ── SETUP ────────────────────────────────────────────────────── */}
          <Section id="setup" icon={<Terminal size={15} />} title="First-time setup">
            <p className="font-medium text-white/70">Step 1 — Organize your music folders</p>
            <p>RadioDJ expects two folder structures:</p>
            <Block>{`C:\\Music\\
  All\\          ← Master folder (flat, all genres mixed)
    track1.mp3
    track2.mp3
    ...
  Genres\\       ← Genre folder (subfolders = genre names)
    Jazz\\
      jazz1.mp3
    Rock\\
      rock1.mp3
    Electronic\\
      ...`}</Block>
            <p>
              The <strong className="text-white/70">master folder</strong> is the fallback — it plays when no vote has been cast. The <strong className="text-white/70">genre folder</strong> contains one subfolder per genre; the subfolder name becomes the genre name your audience votes on.
            </p>
            <Callout type="warn">
              Folder names are case-sensitive. The name shown to voters is exactly the subfolder name.
            </Callout>

            <p className="font-medium text-white/70 mt-6">Step 2 — Start the local server</p>
            <p>Open a terminal in the project folder and run:</p>
            <Block>{`node server.mjs "C:\\Music\\All" "C:\\Music\\Genres"`}</Block>
            <p>On Mac/Linux:</p>
            <Block>{`node server.mjs /home/you/Music/All /home/you/Music/Genres`}</Block>
            <p>
              You should see the server print its address (<Code>http://localhost:3001</Code>) and the list of genres it found. <strong className="text-white/70">Leave this terminal open</strong> — closing it stops the music.
            </p>

            <p className="font-medium text-white/70 mt-6">Step 3 — Create your account</p>
            <p>
              Go to <Code>/login</Code>, enter your email and a password, and click "Create account." Your station is created automatically. Your public vote URL will be shown in the player after connecting.
            </p>

            <p className="font-medium text-white/70 mt-6">Step 4 — Connect the player</p>
            <p>
              Go to the player (<Code>/</Code>), sign in, and click <strong className="text-white/70">"Connect to local server."</strong> The player will scan your folders, load the track list, and sync your genre names to the database (so the vote page can display them).
            </p>
          </Section>

          {/* ── PLAYER ───────────────────────────────────────────────────── */}
          <Section id="player" icon={<Play size={15} />} title="Using the player">
            <p>The player is designed to be added as a Browser Source in OBS. Here's what each control does:</p>

            <div className="space-y-3 my-4">
              {[
                { icon: <Play size={13} />, label: 'Play / Pause', desc: 'Starts or pauses playback. Click the red circle button in the center.' },
                { icon: <SkipForward size={13} />, label: 'Skip forward / back', desc: 'Jump to the next or previous track in the queue. Back-stepping within 3 seconds restarts the current track.' },
                { icon: <Shuffle size={13} />, label: 'Reshuffle', desc: 'Randomizes the current queue order without reloading tracks from the server.' },
                { icon: <Volume2 size={13} />, label: 'Volume slider', desc: 'Adjusts playback volume. Mute button next to it silences output without changing the volume level.' },
                { icon: <Folder size={13} />, label: 'Drop zone', desc: 'Drag .mp3, .wav, .mp4, .jpg, .png, or .gif files directly onto the page to load them locally (no server required).' },
                { icon: <HardDrive size={13} />, label: 'Connect to local server', desc: 'Scans your music folders on the local server and loads them into the player.' },
              ].map((item) => (
                <div key={item.label} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-white/30 flex-shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                  <div>
                    <span className="text-white/70 font-medium">{item.label}</span>
                    <span className="text-white/40"> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="font-medium text-white/70 mt-4">Album art</p>
            <p>
              Album art is read directly from the embedded metadata in your .mp3 and .mp4 files. No separate image files needed. If a track has no embedded art, the player shows an animated visualizer while playing.
            </p>

            <p className="font-medium text-white/70 mt-4">Background images</p>
            <p>
              You can add .jpg, .png, or .gif images as background wallpapers. They rotate every 12 seconds. Click "Add background images" or drag them onto the page. They appear in a strip at the bottom of the queue sidebar — click any thumbnail to jump to it.
            </p>
          </Section>

          {/* ── VOTE PAGE ────────────────────────────────────────────────── */}
          <Section id="votepage" icon={<Vote size={15} />} title="Audience vote page">
            <p>
              The vote page is a public webpage your audience visits. It requires no account and no app — just a browser. Your vote URL looks like:
            </p>
            <Block>{`https://yoursite.com/vote/yourname-abc123`}</Block>
            <p>
              You can find your exact URL in the DJ panel after connecting to the server. Share it in your stream description, on screen, or in your community.
            </p>

            <p className="font-medium text-white/70 mt-4">Genre voting</p>
            <p>
              Viewers see all available genres (pulled from your genre folder structure). They click a genre to vote, optionally select a duration (1, 2, or 3 hours), and submit. Live vote tallies update in real time — the leading genre shows a progress bar.
            </p>

            <p className="font-medium text-white/70 mt-4">Song requests</p>
            <p>
              The "Request a song" tab lets viewers type any song name and artist. Requests go directly to your DJ panel. The player doesn't auto-play requests — you decide what to do with them.
            </p>

            <p className="font-medium text-white/70 mt-4">Deduplication</p>
            <p>
              Each viewer can vote once per hour per station. Their vote is remembered in the browser using localStorage. Clearing browser storage allows re-voting — this is intentional; the system is designed for casual engagement, not ballot security.
            </p>

            <p className="font-medium text-white/70 mt-4">Votes reset every hour</p>
            <p>
              Votes are bucketed by hour. At the top of each hour, the player tallies the votes, picks the winner, and queues the switch. All vote counts reset to zero for the new hour.
            </p>

            <Callout type="info">
              You don't need to stream on any platform for the vote page to work. It's just a webpage — always accessible.
            </Callout>
          </Section>

          {/* ── DJ PANEL ─────────────────────────────────────────────────── */}
          <Section id="djpanel" icon={<Settings size={15} />} title="DJ control panel">
            <p>
              The DJ panel is accessible from the header once you're connected to the server. Click the <strong className="text-white/70">DJ</strong> button. It has four tabs:
            </p>

            <div className="space-y-4 my-4">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p className="text-white/70 font-medium mb-2">Override tab</p>
                <p className="text-[13px] text-white/45 leading-relaxed">
                  Manually force a genre switch. "Queue after current song" waits for the current track to finish before switching. "Switch now" interrupts immediately. The current active source and time until the next vote are displayed here. Your audience vote URL can be copied from this tab.
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p className="text-white/70 font-medium mb-2">Votes tab</p>
                <p className="text-[13px] text-white/45 leading-relaxed">
                  Shows live vote tallies for the current hour. Updates in real time as your audience votes. The leading genre is highlighted. Total vote count shown at the bottom.
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p className="text-white/70 font-medium mb-2">Requests tab</p>
                <p className="text-[13px] text-white/45 leading-relaxed">
                  Lists all song requests submitted by your audience this hour. The most recently unique requests appear here. Up to 30 are shown. These are informational only — you decide whether to play them.
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <p className="text-white/70 font-medium mb-2">Playback tab</p>
                <p className="text-[13px] text-white/45 leading-relaxed">
                  Configure how the player builds and advances the queue. See the Playback Modes section below for details. Settings are saved to your station in the database.
                </p>
              </div>
            </div>

            <Callout type="warn">
              The DJ panel is only visible to you — it requires a logged-in account. The audience vote page is entirely separate.
            </Callout>
          </Section>

          {/* ── PLAYBACK MODES ───────────────────────────────────────────── */}
          <Section id="playback" icon={<Shuffle size={15} />} title="Playback modes">
            <p>Configure these in the DJ panel → Playback tab. Settings are saved per station.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
              {[
                {
                  title: 'Random shuffle',
                  tag: 'default',
                  desc: 'Tracks play in a randomized order. The queue is reshuffled each time a folder is loaded. Best for 24/7 stations — prevents the same track order every loop.',
                },
                {
                  title: 'Sequential',
                  tag: '',
                  desc: 'Tracks play in the order they appear in your folder, sorted by filename. Useful if you\'ve numbered your files or want a specific curation order.',
                },
                {
                  title: 'Loop forever',
                  tag: 'default',
                  desc: 'After the last track in the queue, playback restarts from the beginning. Ideal for 24/7 streaming — the station never stops.',
                },
                {
                  title: 'Stop after all',
                  tag: '',
                  desc: 'Playback stops when the last track finishes. The player sits idle until you manually start it again.',
                },
              ].map((m) => (
                <div key={m.title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-white/70 font-medium text-sm">{m.title}</p>
                    {m.tag && (
                      <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                        {m.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-white/40 leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>

            <Callout type="info">
              When the player switches genres at the top of the hour, it applies the current playback mode to the new track list. A Sequential station stays sequential after a genre switch.
            </Callout>
          </Section>

          {/* ── OBS ──────────────────────────────────────────────────────── */}
          <Section id="obs" icon={<Monitor size={15} />} title="OBS setup">
            <p className="font-medium text-white/70">Add the player as a Browser Source</p>
            <ol className="space-y-2 mt-2 list-decimal list-inside">
              {[
                'In OBS, click the + button under Sources.',
                'Select "Browser."',
                `Set the URL to your player address (e.g. http://localhost:5173 in dev, or your hosted URL).`,
                'Set width to 1280 and height to 720.',
                'Under "Audio output mode," select "Monitor and Output."',
                'Check "Control audio via OBS" if it appears.',
                'Click OK.',
              ].map((step) => (
                <li key={step} className="text-white/55 text-[13px] leading-relaxed pl-1">{step}</li>
              ))}
            </ol>

            <Callout type="warn">
              "Monitor and Output" is critical — without it, OBS will capture the video but not the audio from the browser player.
            </Callout>

            <p className="font-medium text-white/70 mt-5">Recommended OBS audio settings</p>
            <ul className="space-y-1.5 mt-2">
              {[
                'Sample rate: 44100 Hz',
                'Audio bitrate for stream: 160 kbps or higher',
                'Monitoring device: your speakers or headphones (so you can hear it)',
              ].map((s) => (
                <li key={s} className="flex gap-2 text-[13px] text-white/45">
                  <span className="text-white/20">—</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>

            <p className="font-medium text-white/70 mt-5">If the player stops after OBS minimizes</p>
            <p>
              Some browsers throttle background tabs. In Chrome/Edge, use the OBS Browser Source's "Shutdown source when not visible" option — make sure it's <strong className="text-white/70">unchecked</strong>. Also ensure the player tab is the active tab in the OBS browser.
            </p>
          </Section>

          {/* ── TECH SPECS ───────────────────────────────────────────────── */}
          <Section id="techspecs" icon={<HardDrive size={15} />} title="Technical specs">
            <div className="space-y-5">

              <div>
                <p className="text-white/70 font-medium mb-2">Supported file formats</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { ext: '.mp3', type: 'Audio' },
                    { ext: '.wav', type: 'Audio' },
                    { ext: '.mp4', type: 'Video' },
                    { ext: '.jpg/.png/.gif', type: 'Background image' },
                  ].map((f) => (
                    <div key={f.ext} className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2 text-center">
                      <p className="font-mono text-[13px] text-white/70">{f.ext}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">{f.type}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-white/70 font-medium mb-2">Local server</p>
                <div className="space-y-1.5 text-[13px] text-white/45">
                  <p>Runtime: Node.js 18+</p>
                  <p>Port: 3001 (fixed, binds to 127.0.0.1 only — not reachable from internet)</p>
                  <p>File streaming: HTTP byte-range supported (enables seeking)</p>
                  <p>Album art extraction: reads embedded ID3/MP4 metadata via <Code>music-metadata</Code></p>
                  <p>Cover art cache: in-memory per process, cleared on restart</p>
                  <p>Stateless: no database, no session state, safe to restart at any time</p>
                </div>
              </div>

              <div>
                <p className="text-white/70 font-medium mb-2">Database (Supabase)</p>
                <div className="space-y-1.5 text-[13px] text-white/45">
                  <p><Code>stations</Code> — one row per DJ account. Stores name, slug, genre list, playback config.</p>
                  <p><Code>votes</Code> — one row per audience vote. Bucketed by <Code>hour_key</Code> (UTC hour).</p>
                  <p><Code>hourly_vote_result</Code> — the winning genre per hour, written by the player at tally time.</p>
                  <p>RLS: votes table allows anonymous inserts. Stations are readable by anyone (for the vote page).</p>
                  <p>Realtime: vote page subscribes to new inserts for live tally updates.</p>
                </div>
              </div>

              <div>
                <p className="text-white/70 font-medium mb-2">Frontend</p>
                <div className="space-y-1.5 text-[13px] text-white/45">
                  <p>Framework: React 18 + TypeScript + Vite</p>
                  <p>Styling: Tailwind CSS</p>
                  <p>Routing: React Router v7</p>
                  <p>Auth: Supabase email/password (no email confirmation required)</p>
                  <p>Icons: lucide-react</p>
                </div>
              </div>

              <div>
                <p className="text-white/70 font-medium mb-2">Hourly vote cycle</p>
                <div className="space-y-1.5 text-[13px] text-white/45">
                  <p>1. Player sets a <Code>setTimeout</Code> for the exact milliseconds until the next UTC hour boundary.</p>
                  <p>2. At the boundary: query <Code>votes</Code> for <Code>station_id + hour_key + vote_type='genre'</Code>.</p>
                  <p>3. Group by genre, pick the highest count. Validate against available genre folders.</p>
                  <p>4. Write winner to <Code>hourly_vote_result</Code>.</p>
                  <p>5. Set <Code>pendingGenre</Code> in player state.</p>
                  <p>6. On next <Code>onEnded</Code> event (track finishes): load winner's folder, rebuild queue, start playing.</p>
                  <p>7. If no votes: fall back to master folder.</p>
                </div>
              </div>
            </div>
          </Section>

          {/* ── FAQ ──────────────────────────────────────────────────────── */}
          <Section id="faq" icon={<Mic2 size={15} />} title="FAQ">
            <div className="space-y-2">
              <FAQ q="Do I need to keep the browser tab open while streaming?">
                Yes. The player runs in a browser tab captured by OBS. If you close the tab or the browser, playback stops. If OBS uses its built-in browser renderer (which it does by default for Browser Sources), the tab can be hidden — just don't close the OBS scene.
              </FAQ>
              <FAQ q="Can my audience see the DJ panel?">
                No. The DJ panel is only visible when you're logged into your account. The audience vote page at <Code>/vote/your-slug</Code> has no login and no DJ controls.
              </FAQ>
              <FAQ q="What happens if nobody votes?">
                The player falls back to the master folder and plays from there. A notification briefly appears on the player indicating "No votes — playing master."
              </FAQ>
              <FAQ q="Can I have multiple genre folders with nested subfolders?">
                The genre folder scanner walks subfolders recursively, but only top-level subfolders of the genre folder are treated as genre names. Files inside nested subfolders are included in that genre's track list.
              </FAQ>
              <FAQ q="What if I want to play one genre all night and ignore the vote?">
                Use the DJ panel Override tab → "Switch now" to force a genre immediately. Then use "Queue after current song" with the same genre at the end of each hour to keep overriding the automatic tally. Or just leave the player in manual mode by not setting up the server with a genre folder.
              </FAQ>
              <FAQ q="Does the local server need to be on the same machine as the browser?">
                Yes — it binds to <Code>127.0.0.1:3001</Code> by default, which is only accessible from the same machine. If you need to run the server on a different machine, you'd need to modify the bind address in server.mjs and update the SERVER constant in the player — but this introduces security considerations.
              </FAQ>
              <FAQ q="Can other people use this for their own stations?">
                Yes — that's the SaaS model. Each person creates an account, gets their own station slug and vote URL, and runs server.mjs on their own machine. Their data in the database is isolated by station ID.
              </FAQ>
              <FAQ q="What does the duration picker on the vote page do?">
                It records the voter's preference (1, 2, or 3 hours) in the database alongside their vote. The DJ panel shows this data. Currently, the auto-tally counts all votes equally regardless of duration — the DJ can use the duration preference as a signal to manually extend a genre's run.
              </FAQ>
              <FAQ q="Why doesn't the vote page show the current song?">
                The vote page reads from Supabase; it has no connection to the local server. The local server is only accessible from your machine. The current winning genre is shown (from the hourly_vote_result table), but the specific track name would require a separate real-time update mechanism.
              </FAQ>
            </div>
          </Section>

          {/* Footer */}
          <div className="border-t border-white/5 pt-8 mt-8 text-[12px] text-white/20 text-center">
            RadioDJ &middot; User Manual &middot; Built for 24/7 streaming
          </div>

        </main>
      </div>
    </div>
  );
}
