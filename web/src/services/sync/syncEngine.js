/**
 * Local-first sync for one entity ('transactions', 'goals') of one user. React-free so it can be
 * unit-tested with the memory store and a fake remote (see tests/syncEngine.test.js).
 *
 * Rows: { id, updatedAt (device ms of the last edit), deletedAt, syncedAt? (server ms) , ... }.
 *
 *   mutate(row)  writes the row and an outbox entry to the device store (atomically), updates the
 *                in-memory list at once and schedules a flush. Never waits for the network.
 *   sync()       flush (send every outbox entry in one idempotent upsert) then pull (rows changed on
 *                the server since the last pull). Single-flight; called on start, after mutations,
 *                on 'online' and when the app becomes visible. Failures back off exponentially.
 *
 * Conflicts: per row, the copy edited last (device time) wins, the same rule as chooseJourney; the
 * server enforces it too (keep_newest_client_write), so replaying an old entry is harmless.
 */

const isOnlineDefault = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function createSyncEngine({
  entity,
  userId,
  store,
  remote = null, // { list(since) → rows, upsert(rows) } or null for device-only
  isOnline = isOnlineDefault,
  debounceMs = 600,
  retryMinMs = 4_000,
  retryMaxMs = 60_000,
  // Re-read a little before the last pull: rows committed late can carry a slightly older updated_at.
  pullOverlapMs = 60_000,
}) {
  const rows = new Map();
  const outbox = new Map(); // entry key → { key, entity, row, queuedAt }
  const listeners = new Set();
  const pulledAtKey = `${entity}:pulledAt`;
  let status = remote ? 'loading' : 'local'; // local | loading | pending | saving | synced | offline | error
  let lastSyncedAt = null;
  let ready = false;
  let running = null;
  let again = false;
  let timer = 0;
  let retryDelay = retryMinMs;
  let stopped = false;

  const entryKey = (id) => `${entity}:${id}`;
  const build = () => ({ rows: [...rows.values()], pending: outbox.size, status, lastSyncedAt, ready });
  let snapshot = build();

  function emit() {
    snapshot = build();
    listeners.forEach((listener) => listener());
  }

  function setStatus(next) {
    if (next === status) return;
    status = next;
    emit();
  }

  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(sync, delay);
  }

  function backoff() {
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, retryMaxMs);
    return delay;
  }

  /** Newer (by device edit time) wins; returns whether `row` replaced the in-memory copy. */
  function adopt(row) {
    const current = rows.get(row.id);
    if (current && current.updatedAt >= row.updatedAt) return false;
    rows.set(row.id, row);
    return true;
  }

  async function start() {
    const [stored, queued] = await Promise.all([store.loadRows(entity, userId), store.loadOutbox(userId)]);
    stored.forEach(adopt);
    for (const entry of queued) {
      if (entry.entity === entity && !outbox.has(entry.key)) outbox.set(entry.key, entry);
    }
    ready = true;
    emit();
    return sync();
  }

  /** Re-reads the device store (another tab may have written) and syncs. */
  async function refresh() {
    const [stored, queued] = await Promise.all([store.loadRows(entity, userId), store.loadOutbox(userId)]);
    let changed = stored.map(adopt).some(Boolean);
    for (const entry of queued) {
      const current = outbox.get(entry.key);
      if (entry.entity === entity && (!current || current.queuedAt < entry.queuedAt)) {
        outbox.set(entry.key, entry);
        changed = true;
      }
    }
    if (changed) emit();
    return sync();
  }

  async function mutate(row) {
    rows.set(row.id, row);
    if (!remote) {
      emit();
      await store.putRows(entity, userId, [row]);
      return;
    }
    const entry = { key: entryKey(row.id), entity, row, queuedAt: row.updatedAt };
    outbox.set(entry.key, entry);
    if (!isOnline()) status = 'offline';
    else if (status !== 'saving' && status !== 'error') status = 'pending';
    emit();
    schedule(debounceMs);
    await store.queueMutation(entity, userId, row, entry);
  }

  async function flush() {
    const batch = [...outbox.values()];
    if (!batch.length) return;
    setStatus('saving');
    await remote.upsert(batch.map((entry) => entry.row));
    // Entries replaced by a newer mutation while the request was in flight stay queued.
    const done = batch.filter((entry) => outbox.get(entry.key) === entry).map((entry) => entry.key);
    done.forEach((key) => outbox.delete(key));
    emit();
    await store.removeOutbox(userId, done);
  }

  async function pull() {
    const since = (await store.getMeta(userId, pulledAtKey)) ?? 0;
    const remoteRows = await remote.list(since ? Math.max(0, since - pullOverlapMs) : 0);
    const changed = [];
    const superseded = [];
    let newest = since;
    for (const row of remoteRows) {
      newest = Math.max(newest, row.syncedAt || 0);
      if (!adopt(row)) continue;
      changed.push(row);
      // Another device edited this row after our queued edit: ours would lose on the server anyway.
      const queued = outbox.get(entryKey(row.id));
      if (queued && queued.row.updatedAt < row.updatedAt) {
        outbox.delete(queued.key);
        superseded.push(queued.key);
      }
    }
    if (changed.length) {
      emit();
      await store.putRows(entity, userId, changed);
    }
    if (superseded.length) await store.removeOutbox(userId, superseded);
    if (newest > since) await store.setMeta(userId, pulledAtKey, newest);
  }

  async function cycle() {
    clearTimeout(timer);
    if (!isOnline()) {
      setStatus('offline');
      return; // the 'online' listener resumes
    }
    try {
      await flush();
      await pull();
      retryDelay = retryMinMs;
      lastSyncedAt = Date.now();
      status = outbox.size ? 'pending' : 'synced';
      emit();
    } catch (error) {
      console.warn(`[AuraFin] ${entity} sync failed:`, error?.message ?? error);
      if (!isOnline()) {
        setStatus('offline');
      } else {
        setStatus('error');
        schedule(backoff());
      }
    }
  }

  function sync() {
    if (!remote || stopped || !ready) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await cycle();
        } while (again && !stopped && status !== 'error' && status !== 'offline');
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Manual retry (the badge button): resets the backoff. */
  function retry() {
    retryDelay = retryMinMs;
    return sync();
  }

  return {
    start,
    refresh,
    mutate,
    sync,
    retry,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
