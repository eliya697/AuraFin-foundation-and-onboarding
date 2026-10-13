import { calcHourlyRate } from '../lib/finance.js';

const KEYS = {
  user: 'aurafin:user-id',
  profile: 'aurafin:profile',
  transactions: 'aurafin:transactions',
  insights: 'aurafin:insights',
};

const memoryStore = new Map();

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return memoryStore.has(key) ? memoryStore.get(key) : fallback;
  }
}

function write(key, value) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / quota): the in-memory copy keeps the session working.
  }
}

function remove(key) {
  memoryStore.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore: nothing persisted to clear.
  }
}

function sortByDateDesc(rows) {
  return [...rows].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}

export const localRepository = {
  mode: 'local',

  async ensureUser() {
    let id = read(KEYS.user, null);
    if (!id) {
      id = crypto.randomUUID();
      write(KEYS.user, id);
    }
    return id;
  },

  async getAccessToken() {
    return null;
  },

  async loadProfile() {
    return read(KEYS.profile, null);
  },

  async saveProfile(userId, profile) {
    const saved = {
      ...profile,
      id: userId,
      hourly_rate: calcHourlyRate(profile.monthly_income, profile.weekly_work_hours),
    };
    write(KEYS.profile, saved);
    return saved;
  },

  async listTransactions() {
    return sortByDateDesc(read(KEYS.transactions, []));
  },

  async addTransactions(userId, transactions) {
    const created = transactions.map((tx) => ({ ...tx, id: crypto.randomUUID(), user_id: userId }));
    write(KEYS.transactions, sortByDateDesc([...created, ...read(KEYS.transactions, [])]));
    return created;
  },

  async deleteSampleTransactions() {
    write(
      KEYS.transactions,
      read(KEYS.transactions, []).filter((tx) => !tx.flags?.includes('sample')),
    );
  },

  async saveInsight(userId, insight) {
    const history = read(KEYS.insights, []);
    write(KEYS.insights, [{ ...insight, id: crypto.randomUUID(), user_id: userId, created_at: new Date().toISOString() }, ...history].slice(0, 50));
  },

  async resetAll() {
    remove(KEYS.profile);
    remove(KEYS.transactions);
    remove(KEYS.insights);
  },
};
