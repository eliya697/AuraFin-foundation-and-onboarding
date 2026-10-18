import { createClient } from '@supabase/supabase-js';
import { BackendError, messageFor, toBackendError } from './errors.js';
import { clearAuthParams, initialAuthCallback, takePendingOAuth, markPendingOAuth } from './authCallback.js';
import { fromRow, toRow } from '../../lib/transactions.js';
import { goalFromRow, goalToRow } from '../../lib/goals.js';
import { dailyLogFromRow, dailyLogToRow } from '../../lib/habits.js';

const TX_PAGE = 500;
const TX_COLUMNS =
  'id, kind, amount, budget_key, merchant, note, occurred_at, source, import_hash, client_updated_at, deleted_at, updated_at';
const GOAL_COLUMNS = 'id, name, target, saved, deadline, client_updated_at, deleted_at, updated_at';
const DAILY_LOG_COLUMNS = 'id, log_date, no_spend, tasks, client_updated_at, deleted_at, updated_at';

/**
 * Production backend: Supabase Auth for sessions, Postgres (RLS) for per-user journeys and roles.
 * See supabase/migrations/0002_auth_roles_journeys.sql for the schema and policies.
 */
export function createSupabaseBackend(url, anonKey) {
  const client = createClient(url, anonKey, {
    // Implicit flow on purpose: a PKCE link only works in the exact browser that signed up, but
    // confirmation emails are often opened in a mail app's browser or (iOS) outside the installed PWA.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
  // Always the deployed app root (…/AuraFin-foundation-and-onboarding/), never the current deep URL.
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

  /**
   * Finishes whatever email link opened the app before any auth state is reported, so the UI never
   * flashes the login screen while a confirmation is still being processed. Resolves to a result
   * the auth screen can explain ({ kind: 'confirmed' | 'error', type, code }) or null.
   */
  const callback = initialAuthCallback();
  // Set right before we sent the browser to Google: this landing is an OAuth return, not an email link.
  const oauthProvider = takePendingOAuth();
  const callbackResult = (async () => {
    // getSession() waits for supabase-js to consume #access_token=… (detectSessionInUrl).
    const { data: initial } = await client.auth.getSession();
    if (!callback) return null;
    if (oauthProvider) {
      if (callback.kind === 'error') return { ...callback, via: 'oauth', provider: oauthProvider };
      return initial.session ? { kind: 'confirmed', type: 'oauth', provider: oauthProvider } : { kind: 'error', code: 'oauth_failed', via: 'oauth', provider: oauthProvider };
    }
    try {
      if (callback.kind === 'token_hash') {
        const { error } = await client.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
        return error ? { kind: 'error', code: error.code ?? 'otp_expired', type: callback.type } : { kind: 'confirmed', type: callback.type };
      }
      if (callback.kind === 'code') {
        const { error } = await client.auth.exchangeCodeForSession(callback.code);
        return error ? { kind: 'error', code: 'link_other_browser', type: callback.type } : { kind: 'confirmed', type: callback.type };
      }
      if (callback.kind === 'tokens') {
        return initial.session ? { kind: 'confirmed', type: callback.type } : { kind: 'error', code: 'otp_expired', type: callback.type };
      }
      return callback; // { kind: 'error', code, description }
    } finally {
      clearAuthParams();
    }
  })().catch((error) => {
    console.error('[AuraFin] Auth callback failed:', error);
    clearAuthParams();
    return { kind: 'error', code: 'unknown' };
  });

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

    /**
     * cb(event, user). Events are delivered in order, only after the email-link callback finished
     * (see callbackResult), and outside Supabase's own listener (awaiting its calls in there deadlocks).
     */
    onAuthChange(cb) {
      let active = true;
      const deliver = async (event, session) => {
        if (!active) return;
        const authUser = session?.user ?? null;
        let user;
        try {
          user = await withRole(authUser);
        } catch (error) {
          // Never drop a valid session because the role lookup failed.
          console.error('[AuraFin] Role lookup failed:', error);
          user = authUser && { id: authUser.id, email: authUser.email ?? '', emailConfirmed: Boolean(authUser.email_confirmed_at), role: null, suspended: null };
        }
        if (active) cb(event, user);
      };
      // Replay the session as it stands once the link is processed: a confirmation that finished
      // before this subscription existed must still sign the user in.
      let chain = callbackResult.then(async () => {
        const { data } = await client.auth.getSession();
        await deliver('INITIAL_SESSION', data.session);
      });
      const { data } = client.auth.onAuthStateChange((event, session) => {
        chain = chain.then(() => deliver(event, session));
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    },

    /** Outcome of the email link that opened the app (once), for the auth screen to explain. */
    callbackResult() {
      return callbackResult;
    },

    async resendConfirmation(email) {
      unwrap(await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } }));
    },

    async signIn(email, password) {
      unwrap(await client.auth.signInWithPassword({ email, password }));
    },

    /** Leaves the page for the provider; Supabase redirects back to the app root with the session. */
    async signInWithOAuth(provider) {
      // signInWithOAuth only navigates to /authorize; for a provider that is switched off in the
      // dashboard that page is a bare JSON error. Ask the auth server first and explain it here.
      let settings = null;
      try {
        const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
        if (response.ok) settings = await response.json();
      } catch (error) {
        throw toBackendError(error);
      }
      if (settings?.external && !settings.external[provider]) {
        throw new BackendError(messageFor('provider_disabled'), { code: 'provider_disabled' });
      }
      markPendingOAuth(provider);
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) {
        takePendingOAuth();
        throw toBackendError(error);
      }
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

    /**
     * Transactions changed since `since` (server time, ms), tombstones included, oldest change first.
     * Paged because PostgREST caps a response at 1000 rows.
     */
    async listTransactions(userId, { since = 0 } = {}) {
      const result = [];
      for (let from = 0; ; from += TX_PAGE) {
        let query = client.from('transactions').select(TX_COLUMNS).eq('user_id', userId);
        if (since) query = query.gt('updated_at', new Date(since).toISOString());
        const rows = unwrap(await query.order('updated_at').order('id').range(from, from + TX_PAGE - 1), 'טעינת התנועות נכשלה.');
        for (const row of rows ?? []) {
          const tx = fromRow(row);
          if (tx) result.push(tx);
        }
        if (!rows || rows.length < TX_PAGE) return result;
      }
    },

    /** Idempotent upsert on the client-generated id; a delete is a tombstone (deletedAt set). */
    async upsertTransactions(userId, transactions) {
      for (let i = 0; i < transactions.length; i += TX_PAGE) {
        const rows = transactions.slice(i, i + TX_PAGE).map((tx) => toRow(tx, userId));
        unwrap(await client.from('transactions').upsert(rows, { onConflict: 'id' }), 'שמירת התנועות בענן נכשלה.');
      }
    },

    /** Same contract as listTransactions / upsertTransactions, for public.savings_goals. */
    async listGoals(userId, { since = 0 } = {}) {
      let query = client.from('savings_goals').select(GOAL_COLUMNS).eq('user_id', userId);
      if (since) query = query.gt('updated_at', new Date(since).toISOString());
      const rows = unwrap(await query.order('updated_at').limit(1000), 'טעינת יעדי החיסכון נכשלה.');
      return (rows ?? []).map(goalFromRow).filter(Boolean);
    },

    async upsertGoals(userId, goals) {
      if (!goals.length) return;
      unwrap(
        await client.from('savings_goals').upsert(goals.map((goal) => goalToRow(goal, userId)), { onConflict: 'id' }),
        'שמירת יעדי החיסכון בענן נכשלה.',
      );
    },

    /** Daily check-ins (public.daily_logs, migration 0005); same contract as the goals. */
    async listDailyLogs(userId, { since = 0 } = {}) {
      let query = client.from('daily_logs').select(DAILY_LOG_COLUMNS).eq('user_id', userId);
      if (since) query = query.gt('updated_at', new Date(since).toISOString());
      const rows = unwrap(await query.order('updated_at').limit(1000), 'טעינת הצ׳ק-אין היומי נכשלה.');
      return (rows ?? []).map(dailyLogFromRow).filter(Boolean);
    },

    async upsertDailyLogs(userId, logs) {
      if (!logs.length) return;
      unwrap(
        await client.from('daily_logs').upsert(logs.map((log) => dailyLogToRow(log, userId)), { onConflict: 'id' }),
        'שמירת הצ׳ק-אין היומי בענן נכשלה.',
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
