/**
 * RadioDJ Local File Server
 *
 * Usage:
 *   node server.mjs /path/to/master/folder /path/to/genre/folder
 *
 * Arg 1 — Master folder: flat directory, all songs, no subfolders (fallback)
 * Arg 2 — Genre folder:  contains subfolders named by genre (e.g. Rock/, Jazz/)
 *
 * Serves on http://localhost:3001
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';

const PORT = 3001;
const MASTER_FOLDER = process.argv[2] ? path.resolve(process.argv[2]) : null;
const GENRE_FOLDER  = process.argv[3] ? path.resolve(process.argv[3]) : null;
const ALLOWED_ORIGIN = process.env.WEB_APP_ORIGIN ?? 'http://localhost:5173';

const AUDIO_EXTS = new Set(['.mp3', '.wav']);
const VIDEO_EXTS = new Set(['.mp4']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);

const MIME = {
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
}

// Containment check: a path is safe to serve only if it is a strict descendant
// of MASTER_FOLDER or GENRE_FOLDER. Rejects the folder root itself (no directory
// listing) and any path outside the configured roots.
function isPathInside(child) {
  const resolved = path.resolve(child);
  return [MASTER_FOLDER, GENRE_FOLDER]
    .filter(Boolean)
    .some((parent) => resolved.startsWith(path.resolve(parent) + path.sep));
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Scan a single directory (non-recursive) for media files
function scanFlat(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (MEDIA_EXTS.has(ext)) results.push(path.join(dir, entry.name));
  }
  return results;
}

// Recursively walk a directory
function walkDir(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (MEDIA_EXTS.has(ext)) results.push(full);
    }
  }
  return results;
}

// Extract embedded cover art
async function extractCover(filePath) {
  try {
    const meta = await parseFile(filePath, { duration: false, skipCovers: false });
    const pic = meta.common.picture?.[0];
    if (pic) return { data: pic.data.toString('base64'), mime: pic.format };
  } catch {}
  return null;
}

const coverCache = new Map();

async function getCover(filePath) {
  if (coverCache.has(filePath)) return coverCache.get(filePath);
  const cover = await extractCover(filePath);
  coverCache.set(filePath, cover);
  return cover;
}

// Stream a file with range support
function serveFile(req, res, filePath) {
  cors(res);
  const stat = fs.statSync(filePath);
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const total = stat.size;

  const rangeHeader = req.headers['range'];
  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024, total - 1);
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Accept-Ranges':  'bytes',
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function fileId(filePath) {
  return Buffer.from(filePath).toString('base64url');
}

function decodeId(id) {
  return Buffer.from(id, 'base64url').toString('utf8');
}

function buildTrackList(files) {
  const tracks = [];
  const images = [];
  for (const f of files) {
    const ext  = path.extname(f).toLowerCase();
    const name = path.basename(f, ext).replace(/_/g, ' ');
    const id   = fileId(f);
    if (AUDIO_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
      getCover(f); // warm cache in background
      tracks.push({ id, name, ext: ext.slice(1), isVideo: VIDEO_EXTS.has(ext), hasCover: false });
    } else if (IMAGE_EXTS.has(ext)) {
      images.push({ id, name, ext: ext.slice(1) });
    }
  }
  return { tracks, images };
}

const server = http.createServer(async (req, res) => {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res); res.writeHead(204); res.end(); return;
  }

  // GET /status
  if (pathname === '/status') {
    return json(res, {
      ready:       !!MASTER_FOLDER,
      folder:      MASTER_FOLDER || null,
      genreFolder: GENRE_FOLDER || null,
    });
  }

  // GET /genres  — list available genre subfolders
  if (pathname === '/genres') {
    if (!GENRE_FOLDER || !fs.existsSync(GENRE_FOLDER)) {
      return json(res, { genres: [] });
    }
    const genres = fs.readdirSync(GENRE_FOLDER, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    return json(res, { genres });
  }

  // GET /tracks?genre=Rock  — scan folder and return track list
  // ?genre omitted or "master" => master folder
  if (pathname === '/tracks') {
    const genre = url.searchParams.get('genre');

    let targetFolder;
    if (genre && genre !== 'master' && GENRE_FOLDER) {
      if (genre.includes('..') || genre.includes('/') || genre.includes('\\')) {
        return json(res, { error: 'Invalid genre' }, 400);
      }
      targetFolder = path.join(GENRE_FOLDER, genre);
      if (!isPathInside(targetFolder)) {
        console.warn(`(rejected) ${req.method} ${pathname} → ${targetFolder}`);
        return json(res, { error: 'Folder not found' }, 404);
      }
    } else {
      targetFolder = MASTER_FOLDER;
    }

    if (!targetFolder) return json(res, { error: 'No folder specified. Start server with: node server.mjs /path/to/master /path/to/genres' }, 400);
    if (!fs.existsSync(targetFolder)) return json(res, { error: `Folder not found: ${targetFolder}` }, 404);

    const files = genre && genre !== 'master' ? walkDir(targetFolder) : scanFlat(targetFolder);
    const { tracks, images } = buildTrackList(files);

    return json(res, { tracks, images, folder: targetFolder, genre: genre || 'master' });
  }

  // GET /cover/:id
  const coverMatch = pathname.match(/^\/cover\/(.+)$/);
  if (coverMatch) {
    const filePath = decodeId(coverMatch[1]);
    if (!isPathInside(filePath)) {
      console.warn(`(rejected) ${req.method} ${pathname} → ${filePath}`);
      return json(res, { cover: null });
    }
    if (!fs.existsSync(filePath)) return json(res, { cover: null });
    const cover = await getCover(filePath);
    return json(res, { cover });
  }

  // GET /file/:id
  const fileMatch = pathname.match(/^\/file\/(.+)$/);
  if (fileMatch) {
    const filePath = decodeId(fileMatch[1]);
    if (!isPathInside(filePath)) {
      console.warn(`(rejected) ${req.method} ${pathname} → ${filePath}`);
      cors(res); res.writeHead(404); res.end('Not found'); return;
    }
    if (!fs.existsSync(filePath)) {
      cors(res); res.writeHead(404); res.end('Not found'); return;
    }
    return serveFile(req, res, filePath);
  }

  cors(res); res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n RadioDJ Local Server running at http://localhost:${PORT}`);
  console.log(` Allowed origin: ${ALLOWED_ORIGIN}`);
  if (MASTER_FOLDER) {
    console.log(` Master folder : ${MASTER_FOLDER}`);
  } else {
    console.log(' No folder specified!');
    console.log(' Usage: node server.mjs /path/to/master /path/to/genres\n');
    return;
  }
  if (GENRE_FOLDER) {
    console.log(` Genre folder  : ${GENRE_FOLDER}`);
    if (fs.existsSync(GENRE_FOLDER)) {
      const genres = fs.readdirSync(GENRE_FOLDER, { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name);
      console.log(` Genres found  : ${genres.join(', ') || '(none)'}`);
    }
  } else {
    console.log(' Genre folder  : not specified (vote switching disabled)');
  }
  console.log('');
});
