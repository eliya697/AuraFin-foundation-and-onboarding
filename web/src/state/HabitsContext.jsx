import { createContext, useCallback, useContext, useMemo } from 'react';
import { logsByDate, updatedLog } from '../lib/habits.js';
import { todayISO } from '../lib/transactions.js';
import { useSyncedEntity } from './useSyncedEntity.js';

const HabitsContext = createContext(null);
const HabitsSyncContext = createContext({ status: 'local', pending: 0, retry: () => {}, cloud: false });

/**
 * Daily check-ins (no-spend days, micro-tasks) for one signed-in user, local-first like goals:
 * entity 'daily_logs', table public.daily_logs. Mount with key={userId}. Streaks and XP are derived
 * from the logs (lib/habits.js), so there is nothing else to keep in sync.
 */
export function HabitsProvider({ userId, backend = null, store = null, children }) {
  const remote = useMemo(
    () =>
      backend?.listDailyLogs && {
        list: (since) => backend.listDailyLogs(userId, { since }),
        upsert: (rows) => backend.upsertDailyLogs(userId, rows),
      },
    [backend, userId],
  );
  const { rows, ready, mutate, sync } = useSyncedEntity({ entity: 'daily_logs', userId, remote, store });

  const byDate = useMemo(() => logsByDate(rows), [rows]);

  /** Applies { noSpend?, tasks? } to the log of `date` (default today), creating it if needed. */
  const checkIn = useCallback(
    async (patch, date = todayISO()) => mutate(await updatedLog(byDate.get(date) ?? null, { userId, date, patch })),
    [byDate, mutate, userId],
  );

  const value = useMemo(() => ({ logs: rows, byDate, loading: !ready, checkIn }), [rows, byDate, ready, checkIn]);

  return (
    <HabitsContext.Provider value={value}>
      <HabitsSyncContext.Provider value={sync}>{children}</HabitsSyncContext.Provider>
    </HabitsContext.Provider>
  );
}

/** The habits state, or null outside a provider (the check-in widget then doesn't render). */
export function useHabits() {
  return useContext(HabitsContext);
}

export function useHabitsSync() {
  return useContext(HabitsSyncContext);
}
