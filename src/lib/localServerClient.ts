/**
 * Thin client for the local media server (server.mjs).
 * All network calls are async; callers are responsible for error handling.
 */
import type { Track, ImageAsset, PlaySource } from './types';
import { shuffleArr } from './playerUtils';

export const SERVER = 'http://localhost:3001';
export async function fetchCover(
  serverId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const r = await fetch(`${SERVER}/cover/${serverId}`, { signal });
    const body: { cover?: { mime: string; data: string } } = await r.json();
    if (body.cover) return `data:${body.cover.mime};base64,${body.cover.data}`;
  } catch {
    // network or abort — both are non-fatal
  }
  return null;
}

interface ServerStatus {
  ok: true;
  ready: boolean;
  genreFolder: string | null;
}

export async function checkServer(): Promise<ServerStatus | { ok: false }> {
  try {
    const r = await fetch(`${SERVER}/status`);
    if (!r.ok) return { ok: false };
    const body: { ready: boolean; genreFolder?: string | null } = await r.json();
    return { ok: true, ready: body.ready, genreFolder: body.genreFolder ?? null };
  } catch {
    return { ok: false };
  }
}
export async function fetchAvailableGenres(): Promise<string[]> {
  try {
    const r = await fetch(`${SERVER}/genres`);
    const body: { genres?: string[] } = await r.json();
    return body.genres ?? [];
  } catch {
    return [];
  }
}
export async function loadTracksForSource(
  source: PlaySource,
  order: 'random' | 'sequential',
): Promise<{ tracks: Track[]; images: ImageAsset[] } | null> {
  try {
    const url =
      source === 'master'
        ? `${SERVER}/tracks`
        : `${SERVER}/tracks?genre=${encodeURIComponent(source)}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return null;

    const newTracks: Track[] = (
      data.tracks as Array<{ id: string; name: string; isVideo: boolean }>
    ).map((t) => ({
      id: t.id,
      name: t.name,
      isVideo: t.isVideo,
      serverId: t.id,
    }));

    const newImages: ImageAsset[] = (
      data.images as Array<{ id: string; name: string }>
    ).map((img) => ({
      id: img.id,
      name: img.name,
      url: `${SERVER}/file/${img.id}`,
    }));

    const ordered = order === 'random' ? shuffleArr(newTracks) : newTracks;

    return { tracks: ordered, images: newImages };
  } catch {
    return null;
  }
}
