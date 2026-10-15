import { BackendError, messageFor } from './errors.js';
import { ADMIN_EMAIL } from './config.js';

/**
 * DEVELOPMENT ONLY. Used by `vite dev` when no Supabase project is configured, so the auth flow,
 * the admin panel and cloud sync can be exercised locally. Accounts live in this browser's
 * localStorage and are not secure. Production builds never include this module (see index.js).
 */
const USERS_KEY = 'aurafin:dev:users';
const SESSION_KEY = 'aurafin:dev:session';
const journeyKey = (id) => `aurafin:dev:journey:${id}`;
const LATENCY_MS = 250;

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const read = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

async function hash(password, salt) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

const publicUser = (u) =>
  u && { id: u.id, email: u.email, emailConfirmed: true, role: u.role, suspended: Boolean(u.suspended) };

export function createLocalBackend() {
  const listeners = new Set();
  const users = () => read(USERS_KEY, []);
  const saveUsers = (list) => write(USERS_KEY, list);
  const current = () => {
    const session = read(SESSION_KEY, null);
    return session ? users().find((u) => u.id === session.userId) ?? null : null;
  };
  const emit = (event) => {
    const user = publicUser(current());
    listeners.forEach((cb) => cb(event, user));
  };
  const requireAdmin = () => {
    const me = current();
    if (me?.role !== 'admin' || me.suspended) throw new BackendError(messageFor('forbidden'), { code: 'forbidden' });
  };
  const updateUser = (id, patch) => saveUsers(users().map((u) => (u.id === id ? { ...u, ...patch } : u)));

  return {
    kind: 'local',

    async getUser() {
      return publicUser(current());
    },

    onAuthChange(cb) {
      listeners.add(cb);
      setTimeout(() => cb('INITIAL_SESSION', publicUser(current())), 0);
      return () => listeners.delete(cb);
    },

    async signIn(email, password) {
      await wait();
      const user = users().find((u) => u.email === email.toLowerCase());
      if (!user || user.hash !== (await hash(password, user.salt))) {
        throw new BackendError(messageFor('invalid_credentials'), { code: 'invalid_credentials' });
      }
      updateUser(user.id, { lastSignInAt: new Date().toISOString() });
      write(SESSION_KEY, { userId: user.id });
      emit('SIGNED_IN');
    },

    async signUp(email, password) {
      await wait();
      const normalized = email.toLowerCase();
      if (users().some((u) => u.email === normalized)) {
        throw new BackendError(messageFor('user_already_exists'), { code: 'user_already_exists' });
      }
      const salt = crypto.randomUUID();
      const now = new Date().toISOString();
      const user = {
        id: crypto.randomUUID(),
        email: normalized,
        salt,
        hash: await hash(password, salt),
        role: normalized === ADMIN_EMAIL ? 'admin' : 'user',
        suspended: false,
        createdAt: now,
        lastSignInAt: now,
      };
      saveUsers([...users(), user]);
      write(SESSION_KEY, { userId: user.id });
      emit('SIGNED_IN');
      return { needsConfirmation: false };
    },

    callbackResult() {
      return Promise.resolve(null);
    },

    async resendConfirmation() {
      await wait();
    },

    async requestPasswordReset() {
      await wait();
      // Nothing is emailed in dev mode; the UI still shows the "check your inbox" state.
    },

    async updatePassword(password) {
      await wait();
      const me = current();
      if (!me) throw new BackendError(messageFor('session_not_found'), { code: 'session_not_found' });
      const salt = crypto.randomUUID();
      updateUser(me.id, { salt, hash: await hash(password, salt) });
      emit('USER_UPDATED');
    },

    async signOut() {
      window.localStorage.removeItem(SESSION_KEY);
      emit('SIGNED_OUT');
    },

    async getAccessToken() {
      return null;
    },

    async loadJourney(userId) {
      await wait();
      return read(journeyKey(userId), null);
    },

    async saveJourney(userId, { state, stage, updatedAt }) {
      await wait();
      if (current()?.suspended) throw new BackendError(messageFor('user_banned'), { code: 'user_banned' });
      write(journeyKey(userId), { state, stage, updatedAt });
    },

    admin: {
      async listUsers() {
        await wait();
        requireAdmin();
        return users()
          .map((u) => {
            const journey = read(journeyKey(u.id), null);
            const income = Number(journey?.state?.budget?.income);
            return {
              id: u.id,
              email: u.email,
              createdAt: u.createdAt,
              lastSignInAt: u.lastSignInAt,
              emailConfirmed: true,
              role: u.role,
              suspended: Boolean(u.suspended),
              stage: journey?.stage ?? null,
              journeyUpdatedAt: journey ? new Date(journey.updatedAt).toISOString() : null,
              income: Number.isFinite(income) && journey?.state?.budget?.income !== '' ? income : null,
              trackId: journey?.state?.profile?.trackId ?? null,
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async getJourney(userId) {
        await wait();
        requireAdmin();
        return read(journeyKey(userId), null);
      },
      async setRole(userId, role) {
        await wait();
        requireAdmin();
        if (userId === current().id && role !== 'admin') {
          throw new BackendError('אי אפשר להסיר את הרשאת הניהול מעצמכם.', { code: 'forbidden' });
        }
        updateUser(userId, { role });
      },
      async setSuspended(userId, value) {
        await wait();
        requireAdmin();
        if (userId === current().id) throw new BackendError('אי אפשר להשעות את עצמכם.', { code: 'forbidden' });
        updateUser(userId, { suspended: value });
      },
      async resetJourney(userId) {
        await wait();
        requireAdmin();
        // Fresh timestamp so the user's device adopts the reset instead of re-uploading its copy.
        write(journeyKey(userId), { state: {}, stage: 'welcome', updatedAt: Date.now() });
      },
    },
  };
}
