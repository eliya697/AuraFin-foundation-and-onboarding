import { createContext, useCallback, useContext, useMemo } from 'react';
import { deletedTransaction, visibleTransactions } from '../lib/transactions.js';
import { useSyncedEntity } from './useSyncedEntity.js';

const TransactionsContext = createContext(null);
const TxSyncContext = createContext({ status: 'local', pending: 0, retry: () => {}, cloud: false });

/**
 * Transactions (budget actuals) for one signed-in user, local-first. Mount with key={userId}.
 *
 * Every change is written to this device (IndexedDB) together with an outbox entry and shows up at
 * once; the outbox is replayed to the cloud after changes, on app start, on 'online' and when the app
 * comes back to the foreground (see services/sync/syncEngine.js and docs/transactions.md).
 * `store` is injectable for tests.
 */
export function TransactionsProvider({ userId, backend = null, store = null, children }) {
  const remote = useMemo(
    () =>
      backend && {
        list: (since) => backend.listTransactions(userId, { since }),
        upsert: (rows) => backend.upsertTransactions(userId, rows),
      },
    [backend, userId],
  );
  const { rows, ready, mutate, mutateMany, sync } = useSyncedEntity({ entity: 'transactions', userId, remote, store });

  const remove = useCallback((tx) => mutate(deletedTransaction(tx)), [mutate]);

  const transactions = useMemo(() => visibleTransactions(rows), [rows]);
  // `all` includes tombstones: CSV dedupe must also skip imports the user deleted.
  const value = useMemo(
    () => ({ userId, transactions, all: rows, loading: !ready, save: mutate, saveMany: mutateMany, remove }),
    [userId, transactions, rows, ready, mutate, mutateMany, remove],
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
