import { localDb, type LocalUser, type LocalSession } from './localDb';

export type { LocalUser, LocalSession };

export const supabase = {
  auth: {
    getSession(): Promise<{ data: { session: { user: LocalUser } | null } }> {
      const session = localDb.auth.getSession();
      return Promise.resolve({
        data: { session: session ? { user: session.user } : null },
      });
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const { user, error } = await localDb.auth.signInWithPassword(email, password);
      return { data: user ? { user } : null, error: error ? { message: error } : null };
    },

    async signUp({ email, password }: { email: string; password: string }) {
      const { user, error } = await localDb.auth.signUp(email, password);
      return { data: user ? { user } : null, error: error ? { message: error } : null };
    },

    async signOut() {
      await localDb.auth.signOut();
    },

    onAuthStateChange(cb: (_event: string, session: { user: LocalUser } | null) => void) {
      return localDb.auth.onAuthStateChange((s) => {
        cb('SIGNED_OUT', s ? { user: s.user } : null);
      });
    },
  },

  from(table: string) {
    return {
      select: (_columns?: string) => {
        const chain = {
          eq: (_col: string, _val: string) => chain,
          order: (_col: string, _opts?: { ascending: boolean }) => chain,
          limit: (_n: number) => chain,
          maybeSingle: () => {
            if (table === 'stations') {
              const session = localDb.auth.getSession();
              if (session) {
                const station = localDb.stations.getForOwner(session.user.id);
                return Promise.resolve({ data: station, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          single: () => {
            if (table === 'stations') {
              const session = localDb.auth.getSession();
              if (session) {
                const station = localDb.stations.getForOwner(session.user.id);
                return Promise.resolve({ data: station, error: null });
              }
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return chain;
      },

      insert: (row: Record<string, unknown>) => {
        const chain = {
          select: () => chain,
          single: () => {
            if (table === 'stations') {
              const session = localDb.auth.getSession();
              if (session) {
                const station = localDb.stations.createForOwner(session.user.id, session.user.email);
                return Promise.resolve({ data: station, error: null });
              }
            }
            if (table === 'hourly_vote_result') {
              localDb.votes.recordHourlyResult(
                row.station_id as string,
                row.hour_start as string,
                (row.genre as string | null) ?? null,
              );
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return chain;
      },

      update: (patch: Record<string, unknown>) => {
        const chain = {
          eq: (col: string, val: string) => {
            if (table === 'stations' && col === 'id') {
              localDb.stations.update(val, patch);
            }
            return chain;
          },
        };
        return chain;
      },
    };
  },

  rpc(fn: string, params: Record<string, unknown>) {
    if (fn === 'get_current_winner') {
      const winner = localDb.votes.getCurrentWinner(params.p_station_id as string);
      return Promise.resolve({ data: winner, error: null });
    }
    if (fn === 'get_genre_tallies') {
      const tallies = localDb.votes.getTallies(params.p_station_id as string, params.p_hour_key as string);
      return Promise.resolve({ data: tallies, error: null });
    }
    if (fn === 'get_song_requests') {
      const requests = localDb.votes.getSongRequests(params.p_station_id as string, params.p_hour_key as string);
      return Promise.resolve({ data: requests.map(v => ({ value: v })), error: null });
    }
    if (fn === 'submit_vote') {
      const recorded = localDb.votes.submit(
        params.p_station_id as string,
        params.p_vote_type as 'genre' | 'song',
        params.p_value as string,
        params.p_voter_token as string,
        params.p_hour_key as string,
        (params.p_duration_minutes as number | null) ?? undefined,
      );
      return Promise.resolve({ data: recorded, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fn}` } });
  },
};
