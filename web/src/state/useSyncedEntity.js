import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { openLocalStore } from '../services/sync/localStore.js';
import { createSyncEngine } from '../services/sync/syncEngine.js';

const EMPTY = { rows: [], pending: 0, status: 'loading', lastSyncedAt: null, ready: false };
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

/**
 * One local-first entity ('transactions', 'goals') for one user: opens the device store, runs a sync
 * engine and replays its outbox on 'online' and when the app comes back to the foreground.
 *
 * `remote` is { list(since), upsert(rows) } or null (device only); pass a memoized value.
 * Returns the engine snapshot plus `mutate` / `mutateMany` that wait for the store if needed.
 */
export function useSyncedEntity({ entity, userId, remote, store = null }) {
  const [engine, setEngine] = useState(null);
  const engineRef = useRef(null);
  const waiters = useRef([]);

  useEffect(() => {
    let cancelled = false;
    let created = null;
    (store ? Promise.resolve(store) : openLocalStore()).then((resolved) => {
      if (cancelled) return;
      created = createSyncEngine({ entity, userId, store: resolved, remote });
      engineRef.current = created;
      waiters.current.splice(0).forEach((resolve) => resolve(created));
      setEngine(created);
      created.start().catch((error) => console.warn(`[AuraFin] Loading ${entity} failed:`, error?.message ?? error));
    });
    return () => {
      cancelled = true;
      created?.stop();
      engineRef.current = null;
    };
  }, [entity, userId, remote, store]);

  // Reconnect → replay; back to the foreground → pick up other tabs' writes and other devices' edits.
  useEffect(() => {
    if (!engine) return undefined;
    const onNetwork = () => engine.sync(); // offline: marks the status; online: replays
    const onVisibility = () => {
      if (document.visibilityState === 'visible') engine.refresh();
    };
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [engine]);

  const snapshot = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getSnapshot ?? emptySnapshot);

  /** Resolves with the engine once the device store is open (a save right after mount waits for it). */
  const ready = useCallback(
    () => (engineRef.current ? Promise.resolve(engineRef.current) : new Promise((resolve) => waiters.current.push(resolve))),
    [],
  );
  const mutate = useCallback(async (row) => (await ready()).mutate(row), [ready]);
  const mutateMany = useCallback(async (rows) => (await ready()).mutateMany(rows), [ready]);
  const retry = useCallback(() => engineRef.current?.retry(), []);

  const sync = useMemo(
    () => ({ status: snapshot.status, pending: snapshot.pending, lastSyncedAt: snapshot.lastSyncedAt, retry, cloud: Boolean(remote) }),
    [snapshot.status, snapshot.pending, snapshot.lastSyncedAt, retry, remote],
  );

  return { rows: snapshot.rows, ready: snapshot.ready, mutate, mutateMany, sync };
}
