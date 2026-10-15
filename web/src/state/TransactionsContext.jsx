import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { deletedTransaction, visibleTransactions } from '../lib/transactions.js';
import { openLocalStore } from '../services/sync/localStore.js';
import { createSyncEngine } from '../services/sync/syncEngine.js';

const TransactionsContext = createContext(null);
const TxSyncContext = createContext({ status: 'local', pending: 0, retry: () => {}, cloud: false });

const EMPTY = { rows: [], pending: 0, status: 'loading', lastSyncedAt: null, ready: false };
const noopSubscribe = () => () => {};

/**
 * Transactions (budget actuals) for one signed-in user, local-first. Mount with key={userId}.
 *
 * Every change is written to this device (IndexedDB) together with an outbox entry and shows up at
 * once; the outbox is replayed to the cloud after changes, on app start, on 'online' and when the app
 * comes back to the foreground (see services/sync/syncEngine.js and docs/transactions.md).
 * `store` is injectable for tests.
 */
export function TransactionsProvider({ userId, backend = null, store = null, children }) {
  const [engine, setEngine] = useState(null);
  const engineRef = useRef(null);
  const waiters = useRef([]);

  useEffect(() => {
    let cancelled = false;
    let created = null;
    (store ? Promise.resolve(store) : openLocalStore()).then((resolved) => {
      if (cancelled) return;
      const remote = backend && {
        list: (since) => backend.listTransactions(userId, { since }),
        upsert: (rows) => backend.upsertTransactions(userId, rows),
      };
      created = createSyncEngine({ entity: 'transactions', userId, store: resolved, remote });
      engineRef.current = created;
      waiters.current.splice(0).forEach((resolve) => resolve(created));
      setEngine(created);
      created.start().catch((error) => console.warn('[AuraFin] Loading transactions failed:', error?.message ?? error));
    });
    return () => {
      cancelled = true;
      created?.stop();
      engineRef.current = null;
    };
  }, [userId, backend, store]);

  // Reconnect → replay; back to the foreground → pick up other tabs' writes and other devices' edits.
  useEffect(() => {
    if (!engine) return undefined;
    const onOnline = () => engine.sync();
    const onOffline = () => engine.sync(); // marks the status offline
    const onVisibility = () => {
      if (document.visibilityState === 'visible') engine.refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [engine]);

  const snapshot = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getSnapshot ?? (() => EMPTY));

  /** Resolves with the engine once the device store is open (a save right after mount waits for it). */
  const ready = useCallback(
    () => (engineRef.current ? Promise.resolve(engineRef.current) : new Promise((resolve) => waiters.current.push(resolve))),
    [],
  );

  const save = useCallback(async (tx) => (await ready()).mutate(tx), [ready]);
  const remove = useCallback(async (tx) => (await ready()).mutate(deletedTransaction(tx)), [ready]);
  const saveMany = useCallback(async (list) => (await ready()).mutateMany(list), [ready]);
  const retry = useCallback(() => engineRef.current?.retry(), []);

  const transactions = useMemo(() => visibleTransactions(snapshot.rows), [snapshot.rows]);
  // `all` includes tombstones: CSV dedupe must also skip imports the user deleted.
  const value = useMemo(
    () => ({ userId, transactions, all: snapshot.rows, loading: !snapshot.ready, save, saveMany, remove }),
    [userId, transactions, snapshot.rows, snapshot.ready, save, saveMany, remove],
  );
  const sync = useMemo(
    () => ({ status: snapshot.status, pending: snapshot.pending, lastSyncedAt: snapshot.lastSyncedAt, retry, cloud: Boolean(backend) }),
    [snapshot.status, snapshot.pending, snapshot.lastSyncedAt, retry, backend],
  );

  return (
    <TransactionsContext.Provider value={value}>
      <TxSyncContext.Provider value={sync}>{children}</TxSyncContext.Provider>
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used inside <TransactionsProvider>');
  return ctx;
}

/** Outbox status for the sync badge; a harmless default outside the provider. */
export function useTransactionsSync() {
  return useContext(TxSyncContext);
}
