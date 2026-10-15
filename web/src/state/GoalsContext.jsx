import { createContext, useCallback, useContext, useMemo } from 'react';
import { visibleGoals } from '../lib/goals.js';
import { useSyncedEntity } from './useSyncedEntity.js';

const GoalsContext = createContext(null);
const GoalsSyncContext = createContext({ status: 'local', pending: 0, retry: () => {}, cloud: false });

/** Savings goals for one signed-in user, local-first like transactions. Mount with key={userId}. */
export function GoalsProvider({ userId, backend = null, store = null, children }) {
  const remote = useMemo(
    () =>
      backend && {
        list: (since) => backend.listGoals(userId, { since }),
        upsert: (rows) => backend.upsertGoals(userId, rows),
      },
    [backend, userId],
  );
  const { rows, ready, mutate, sync } = useSyncedEntity({ entity: 'goals', userId, remote, store });

  const remove = useCallback((goal) => {
    const now = Date.now();
    return mutate({ ...goal, updatedAt: now, deletedAt: now });
  }, [mutate]);

  const goals = useMemo(() => visibleGoals(rows), [rows]);
  const value = useMemo(() => ({ goals, loading: !ready, save: mutate, remove }), [goals, ready, mutate, remove]);

  return (
    <GoalsContext.Provider value={value}>
      <GoalsSyncContext.Provider value={sync}>{children}</GoalsSyncContext.Provider>
    </GoalsContext.Provider>
  );
}

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoals must be used inside <GoalsProvider>');
  return ctx;
}

export function useGoalsSync() {
  return useContext(GoalsSyncContext);
}
