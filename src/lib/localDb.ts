import type { Station, VoteTally } from './types';
import { emailToSlug } from './playerUtils';

const USERS_KEY = 'radiodj_users';
const SESSION_KEY = 'radiodj_session';
const STATIONS_KEY = 'radiodj_stations';
const VOTES_KEY = 'radiodj_votes';
const HOURLY_KEY = 'radiodj_hourly_results';

export interface LocalUser {
  id: string;
  email: string;
  password: string;
}

export interface LocalSession {
  user: LocalUser;
  token: string;
}

interface StoredVote {
  station_id: string;
  vote_type: 'genre' | 'song';
  value: string;
  voter_token: string;
  hour_key: string;
  duration_minutes?: number;
  created_at: string;
}

interface StoredHourlyResult {
  id: string;
  station_id: string;
  hour_start: string;
  genre: string | null;
  created_at: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function uuid(): string {
  return crypto.randomUUID();
}

export const localDb = {
  auth: {
    getSession(): LocalSession | null {
      return read<LocalSession | null>(SESSION_KEY, null);
    },

    async signInWithPassword(email: string, password: string): Promise<{ user: LocalUser | null; error: string | null }> {
      const users = read<LocalUser[]>(USERS_KEY, []);
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) return { user: null, error: 'Invalid email or password.' };

      const session: LocalSession = { user, token: uuid() };
      write(SESSION_KEY, session);
      return { user, error: null };
    },

    async signUp(email: string, password: string): Promise<{ user: LocalUser | null; error: string | null }> {
      const users = read<LocalUser[]>(USERS_KEY, []);
      if (users.some(u => u.email === email)) {
        return { user: null, error: 'An account with this email already exists.' };
      }
      const user: LocalUser = { id: uuid(), email, password };
      users.push(user);
      write(USERS_KEY, users);

      const session: LocalSession = { user, token: uuid() };
      write(SESSION_KEY, session);
      return { user, error: null };
    },

    async signOut(): Promise<void> {
      localStorage.removeItem(SESSION_KEY);
    },

    onAuthStateChange(cb: (session: LocalSession | null) => void): { unsubscribe: () => void } {
      const handler = (e: StorageEvent) => {
        if (e.key === SESSION_KEY) {
          cb(read<LocalSession | null>(SESSION_KEY, null));
        }
      };
      window.addEventListener('storage', handler);
      return { unsubscribe: () => window.removeEventListener('storage', handler) };
    },
  },

  stations: {
    getForOwner(ownerId: string): Station | null {
      const stations = read<Station[]>(STATIONS_KEY, []);
      return stations.find(s => s.owner_id === ownerId) ?? null;
    },

    createForOwner(ownerId: string, email: string): Station {
      const stations = read<Station[]>(STATIONS_KEY, []);
      const slug = emailToSlug(email, ownerId);
      const station: Station = {
        id: uuid(),
        owner_id: ownerId,
        name: 'My Station',
        slug,
        genres: [],
        playback_config: { order: 'random', loop: 'loop' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      stations.push(station);
      write(STATIONS_KEY, stations);
      return station;
    },

    update(id: string, patch: Partial<Station>): void {
      const stations = read<Station[]>(STATIONS_KEY, []);
      const idx = stations.findIndex(s => s.id === id);
      if (idx >= 0) {
        stations[idx] = { ...stations[idx], ...patch, updated_at: new Date().toISOString() };
        write(STATIONS_KEY, stations);
      }
    },

    getBySlug(slug: string): Station | null {
      const stations = read<Station[]>(STATIONS_KEY, []);
      return stations.find(s => s.slug === slug) ?? null;
    },

    getFirst(): Station | null {
      const stations = read<Station[]>(STATIONS_KEY, []);
      return stations[0] ?? null;
    },
  },

  votes: {
    submit(
      stationId: string,
      voteType: 'genre' | 'song',
      value: string,
      voterToken: string,
      hourKey: string,
      durationMinutes?: number,
    ): boolean {
      const votes = read<StoredVote[]>(VOTES_KEY, []);
      const existing = votes.find(
        v => v.station_id === stationId && v.voter_token === voterToken && v.hour_key === hourKey && v.vote_type === 'genre',
      );
      if (existing && voteType === 'genre') return false;

      const vote: StoredVote = {
        station_id: stationId,
        vote_type: voteType,
        value,
        voter_token: voterToken,
        hour_key: hourKey,
        duration_minutes: durationMinutes,
        created_at: new Date().toISOString(),
      };
      votes.push(vote);
      write(VOTES_KEY, votes);
      return true;
    },

    getTallies(stationId: string, hourKey: string): VoteTally[] {
      const votes = read<StoredVote[]>(VOTES_KEY, []);
      const map: Record<string, number> = {};
      for (const v of votes) {
        if (v.station_id !== stationId || v.hour_key !== hourKey || v.vote_type !== 'genre') continue;
        map[v.value] = (map[v.value] || 0) + 1;
      }
      return Object.entries(map)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
    },

    getCurrentWinner(stationId: string): string | null {
      const results = read<StoredHourlyResult[]>(HOURLY_KEY, []);
      const stationResults = results
        .filter(r => r.station_id === stationId)
        .sort((a, b) => b.hour_start.localeCompare(a.hour_start));
      return stationResults[0]?.genre ?? null;
    },

    getSongRequests(stationId: string, hourKey: string): string[] {
      const votes = read<StoredVote[]>(VOTES_KEY, []);
      return votes
        .filter(v => v.station_id === stationId && v.hour_key === hourKey && v.vote_type === 'song')
        .map(v => v.value);
    },

    recordHourlyResult(stationId: string, hourStart: string, genre: string | null): void {
      const results = read<StoredHourlyResult[]>(HOURLY_KEY, []);
      results.push({
        id: uuid(),
        station_id: stationId,
        hour_start: hourStart,
        genre,
        created_at: new Date().toISOString(),
      });
      write(HOURLY_KEY, results);
    },
  },
};
