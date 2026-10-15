import { createClient } from '@supabase/supabase-js';
import { BackendError, toBackendError } from './errors.js';

/**
 * Production backend: Supabase Auth for sessions, Postgres (RLS) for per-user journeys and roles.
 * See supabase/migrations/0002_auth_roles_journeys.sql for the schema and policies.
 */
export function createSupabaseBackend(url, anonKey) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

  async function withRole(authUser) {
    if (!authUser) return null;
    const { data, error } = await client.from('user_roles').select('role, suspended').eq('user_id', authUser.id).maybeSingle();
    if (error) console.warn('[AuraFin] Could not load role:', error.message);
    return {
      id: authUser.id,
      email: authUser.email ?? '',
      emailConfirmed: Boolean(authUser.email_confirmed_at),
      // null = unknown (e.g. offline); AuthContext keeps the last known value instead of guessing.
      role: error ? null : data?.role === 'admin' ? 'admin' : 'user',
      suspended: error ? null : Boolean(data?.suspended),
    };
  }

  const unwrap = (result, fallback) => {
    if (result.error) throw toBackendError(result.error, fallback);
    return result.data;
  };

  return {
    kind: 'supabase',

    async getUser() {
      const { data } = await client.auth.getSession();
      return withRole(data.session?.user ?? null);
    },

    /** cb(event, user). Supabase forbids awaiting its own calls inside the listener, so defer. */
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        setTimeout(async () => {
          try {
            cb(event, await withRole(session?.user ?? null));
          } catch (error) {
            console.error('[AuraFin] Auth listener failed:', error);
            cb(event, null);
          }
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      unwrap(await client.auth.signInWithPassword({ email, password }));
    },

    async signUp(email, password) {
      const data = unwrap(await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
      return { needsConfirmation: !data.session };
    },

    async requestPasswordReset(email) {
      unwrap(await client.auth.resetPasswordForEmail(email, { redirectTo }));
    },

    async updatePassword(password) {
      unwrap(await client.auth.updateUser({ password }));
    },

    async signOut() {
      // 'local' clears this device even when the network is down.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) console.warn('[AuraFin] Sign-out:', error.message);
    },

    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async loadJourney(userId) {
      const data = unwrap(
        await client.from('journeys').select('state, client_updated_at').eq('user_id', userId).maybeSingle(),
        'טעינת הנתונים מהענן נכשלה.',
      );
      return data ? { state: data.state, updatedAt: Date.parse(data.client_updated_at) || 0 } : null;
    },

    async saveJourney(userId, { state, stage, updatedAt }) {
      unwrap(
        await client
          .from('journeys')
          .upsert({ user_id: userId, state, stage, client_updated_at: new Date(updatedAt).toISOString() }, { onConflict: 'user_id' }),
        'שמירת הנתונים בענן נכשלה.',
      );
    },

    admin: {
      async listUsers() {
        const rows = unwrap(await client.rpc('admin_list_users'), 'טעינת המשתמשים נכשלה.');
        return (rows ?? []).map((row) => ({
          id: row.id,
          email: row.email,
          createdAt: row.created_at,
          lastSignInAt: row.last_sign_in_at,
          emailConfirmed: row.email_confirmed,
          role: row.role,
          suspended: row.suspended,
          stage: row.stage,
          journeyUpdatedAt: row.journey_updated_at,
          income: row.income === null ? null : Number(row.income),
          trackId: row.track_id,
        }));
      },
      async getJourney(userId) {
        const data = unwrap(
          await client.from('journeys').select('state, client_updated_at').eq('user_id', userId).maybeSingle(),
          'טעינת הנתונים נכשלה.',
        );
        return data ? { state: data.state, updatedAt: Date.parse(data.client_updated_at) || 0 } : null;
      },
      async setRole(userId, role) {
        unwrap(await client.rpc('admin_set_role', { target: userId, new_role: role }), 'עדכון ההרשאה נכשל.');
      },
      async setSuspended(userId, value) {
        unwrap(await client.rpc('admin_set_suspended', { target: userId, value }), 'עדכון ההשעיה נכשל.');
      },
      async resetJourney(userId) {
        unwrap(await client.rpc('admin_reset_journey', { target: userId }), 'איפוס הנתונים נכשל.');
      },
    },
  };
}

export { BackendError };
