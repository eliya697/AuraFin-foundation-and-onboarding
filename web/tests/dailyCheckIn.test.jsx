import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DailyCheckInWidget from '../src/features/habits/DailyCheckInWidget.jsx';
import { HabitsProvider } from '../src/state/HabitsContext.jsx';
import { TransactionsProvider } from '../src/state/TransactionsContext.jsx';
import { createMemoryStore } from '../src/services/sync/localStore.js';
import { todayISO } from '../src/lib/transactions.js';
import { BUDGET, PROFILE } from './fixtures.js';

function fakeHabitsBackend() {
  const stored = [];
  return {
    stored,
    listDailyLogs: vi.fn(async () => stored.map((row) => ({ ...row }))),
    upsertDailyLogs: vi.fn(async (_userId, rows) => {
      for (const row of rows) {
        const i = stored.findIndex((s) => s.id === row.id);
        if (i >= 0) stored[i] = row;
        else stored.push(row);
      }
    }),
  };
}

function renderWidget({ transactions = [], habitsBackend = null } = {}) {
  const txStore = createMemoryStore();
  const txBackend = { listTransactions: async () => transactions, upsertTransactions: async () => {} };
  return render(
    <TransactionsProvider userId="u1" backend={txBackend} store={txStore}>
      <HabitsProvider userId="u1" backend={habitsBackend} store={createMemoryStore()}>
        <DailyCheckInWidget budget={BUDGET} profile={PROFILE} savingsGoal={1000} onReviewTransactions={() => {}} />
      </HabitsProvider>
    </TransactionsProvider>,
  );
}

describe('DailyCheckInWidget', () => {
  it('logs a no-spend day, starts the streak, awards XP and syncs the check-in', async () => {
    const backend = fakeHabitsBackend();
    renderWidget({ habitsBackend: backend });
    expect(await screen.findByText('הוצאתם כסף היום?')).toBeTruthy();
    expect(screen.getByText('מותר להוציא היום')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'לא, יום בלי הוצאות' }));
    expect(await screen.findByText(/יום בלי הוצאות! כל הכבוד/)).toBeTruthy();
    expect(screen.getByLabelText('רצף של 1 ימים בלי הוצאות')).toBeTruthy();
    expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/\+30 XP/);

    fireEvent.click(screen.getByRole('checkbox', { name: 'לבדוק כמה נשאר להוציא היום' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'לבדוק כמה נשאר להוציא היום' }).checked).toBe(true));

    await waitFor(() => expect(backend.stored).toHaveLength(1), { timeout: 3000 });
    expect(backend.stored[0]).toMatchObject({ date: todayISO(), noSpend: true, tasks: { allowance: true } });
  });

  it('a day with recorded expenses cannot be a no-spend day; a manual entry ticks the cash task', async () => {
    const today = todayISO();
    renderWidget({
      transactions: [
        { id: 't1', kind: 'expense', amount: 35, budgetKey: 'dining', merchant: 'קפה', note: '', occurredOn: today, source: 'manual', importHash: null, updatedAt: 1, deletedAt: null },
      ],
    });
    expect(await screen.findByText(/רשמתם היום הוצאה אחת/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'לא, יום בלי הוצאות' })).toBeNull();
    const cash = screen.getByRole('checkbox', { name: 'לרשום הוצאה במזומן (אם הייתה)' });
    expect(cash.checked).toBe(true);
    expect(cash.disabled).toBe(true);
    const meter = screen.getByRole('progressbar', { name: 'ניצול הסכום היומי' });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  });

  it('"yes" asks to record the expense in the add sheet', async () => {
    renderWidget();
    fireEvent.click(await screen.findByRole('button', { name: 'כן' }));
    fireEvent.click(await screen.findByRole('button', { name: /רישום הוצאה/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/הוספת תנועה|תנועה חדשה/)).toBeTruthy();
  });
});
