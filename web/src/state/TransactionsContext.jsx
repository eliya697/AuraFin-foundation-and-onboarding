import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deletedTransaction, mergeTransactions, visibleTransactions } from '../lib/transactions.js';

const TransactionsContext = createContext(null);

/**
 * Transactions (budget actuals) for one signed-in user. Mount with key={userId}.
 *
 * Writes are optimistic: the list updates at once and is rolled back if the backend refuses.
 * `items` keeps tombstones so a stale copy can never resurrect a deleted row; `transactions` is the
 * visible, newest-first list. See docs/transactions.md.
 */
export function TransactionsProvider({ userId, backend = null, children }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(backend ? 'loading' : 'ready'); // 'loading' | 'ready' | 'error'
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async () => {
    if (!backend) return;
    setStatus('loading');
    try {
      const remote = await backend.listTransactions(userId);
      setItems((local) => mergeTransactions(local, remote));
      setStatus('ready');
    } catch (error) {
      console.warn('[AuraFin] Loading transactions failed:', error?.message ?? error);
      setStatus('error');
    }
  }, [backend, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const write = useCallback(
    async (tx) => {
      const previous = itemsRef.current.find((item) => item.id === tx.id) ?? null;
      setItems((list) => mergeTransactions(list, [tx]));
      if (!backend) return;
      try {
        await backend.upsertTransactions(userId, [tx]);
      } catch (error) {
        // Roll back only if nothing newer replaced this write meanwhile.
        setItems((list) => {
          const others = list.filter((item) => item.id !== tx.id);
          const now = list.find((item) => item.id === tx.id);
          if (now && now.updatedAt !== tx.updatedAt) return list;
          return previous ? [...others, previous] : others;
        });
        throw error;
      }
    },
    [backend, userId],
  );

  const remove = useCallback((tx) => write(deletedTransaction(tx)), [write]);

  const transactions = useMemo(() => visibleTransactions(items), [items]);
  const value = useMemo(() => ({ transactions, status, save: write, remove, reload: load }), [transactions, status, write, remove, load]);

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used inside <TransactionsProvider>');
  return ctx;
}
