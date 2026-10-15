/**
 * Device storage for local-first data: each user's rows per entity ('transactions', 'goals'), the
 * outbox of mutations not yet accepted by the cloud, and small sync metadata (last pull time).
 *
 * Production uses IndexedDB (the `aurafin` database). Where IndexedDB is unavailable (some private
 * modes, jsdom in tests) an in-memory store with the same API is used instead: the app keeps working
 * for the session, it just doesn't survive a reload.
 *
 * Outbox entries: { key: '<entity>:<row id>', entity, row, queuedAt }. One entry per row (a later
 * mutation of the same row replaces the earlier one), so a replay sends each row's latest state once.
 */

const DB_NAME = 'aurafin';
const DB_VERSION = 1;
export const ENTITIES = ['transactions', 'goals'];
const STORES = [...ENTITIES, 'outbox', 'meta'];

const keyOf = (userId, id) => `${userId}|${id}`;

/** Same API as the IndexedDB store, kept in memory. Also used by the tests. */
export function createMemoryStore() {
  const tables = Object.fromEntries(STORES.map((name) => [name, new Map()]));
  const all = (table, userId) => [...tables[table].values()].filter((rec) => rec.userId === userId).map((rec) => rec.value);
  const put = (table, userId, id, value) => tables[table].set(keyOf(userId, id), { userId, value });

  return {
    kind: 'memory',
    async loadRows(entity, userId) {
      return all(entity, userId);
    },
    async putRows(entity, userId, rows) {
      for (const row of rows) put(entity, userId, row.id, row);
    },
    async queueMutations(entity, userId, rows, entries) {
      for (const row of rows) put(entity, userId, row.id, row);
      for (const entry of entries) put('outbox', userId, entry.key, entry);
    },
    async loadOutbox(userId) {
      return all('outbox', userId);
    },
    async removeOutbox(userId, keys) {
      for (const key of keys) tables.outbox.delete(keyOf(userId, key));
    },
    async getMeta(userId, key) {
      return tables.meta.get(keyOf(userId, key))?.value ?? null;
    },
    async setMeta(userId, key, value) {
      put('meta', userId, key, value);
    },
  };
}

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' }).createIndex('userId', 'userId');
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
}

function createIdbStore(db) {
  /** Runs `work(stores)` in one IndexedDB transaction; resolves with its result once it commits. */
  const run = (names, mode, work) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));
      let result;
      Promise.resolve(work(stores)).then((value) => {
        result = value;
      }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });

  const all = (name, userId) =>
    run([name], 'readonly', async (s) => (await promisify(s[name].index('userId').getAll(userId))).map((rec) => rec.value));
  const record = (userId, id, value) => ({ key: keyOf(userId, id), userId, value });

  return {
    kind: 'indexeddb',
    loadRows: (entity, userId) => all(entity, userId),
    putRows: (entity, userId, rows) =>
      run([entity], 'readwrite', (s) => {
        for (const row of rows) s[entity].put(record(userId, row.id, row));
      }),
    // Atomic: the rows and their outbox entries are written together or not at all.
    queueMutations: (entity, userId, rows, entries) =>
      run([entity, 'outbox'], 'readwrite', (s) => {
        for (const row of rows) s[entity].put(record(userId, row.id, row));
        for (const entry of entries) s.outbox.put(record(userId, entry.key, entry));
      }),
    loadOutbox: (userId) => all('outbox', userId),
    removeOutbox: (userId, keys) =>
      run(['outbox'], 'readwrite', (s) => {
        for (const key of keys) s.outbox.delete(keyOf(userId, key));
      }),
    getMeta: (userId, key) =>
      run(['meta'], 'readonly', async (s) => (await promisify(s.meta.get(keyOf(userId, key))))?.value ?? null),
    setMeta: (userId, key, value) =>
      run(['meta'], 'readwrite', (s) => {
        s.meta.put(record(userId, key, value));
      }),
  };
}

let pending = null;

/** The device store: IndexedDB when available, otherwise in memory. Opened once per page. */
export function openLocalStore() {
  if (!pending) {
    pending = (async () => {
      if (typeof window === 'undefined' || !window.indexedDB) return createMemoryStore();
      try {
        return createIdbStore(await openDatabase());
      } catch (error) {
        console.warn('[AuraFin] IndexedDB unavailable, keeping data in memory:', error?.message ?? error);
        return createMemoryStore();
      }
    })();
  }
  return pending;
}
