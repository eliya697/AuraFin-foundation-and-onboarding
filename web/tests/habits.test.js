import { describe, expect, it } from 'vitest';
import {
  XP,
  dailyAllowance,
  dailyLogFromRow,
  dailyLogId,
  dailyLogToRow,
  dayXp,
  earnedBadges,
  emptyTasks,
  experience,
  feedbackBadges,
  noSpendStreak,
  shiftDate,
  updatedLog,
} from '../src/lib/habits.js';
import { budgetLines } from '../src/lib/transactions.js';
import { BUDGET, PROFILE } from './fixtures.js';

const TODAY = '2026-10-15';
const log = (date, noSpend, tasks = {}) => ({ id: `l-${date}`, date, noSpend, tasks: { ...emptyTasks(), ...tasks }, updatedAt: 1, deletedAt: null });
const spend = (occurredOn, amount, budgetKey = 'dining') => ({
  id: `t-${occurredOn}-${amount}-${budgetKey}`,
  kind: 'expense',
  amount,
  budgetKey,
  occurredOn,
  merchant: '',
  note: '',
  source: 'manual',
  importHash: null,
  updatedAt: 1,
  deletedAt: null,
});

describe('no-spend streaks', () => {
  const run = [log('2026-10-12', true), log('2026-10-13', true), log('2026-10-14', true)];

  it('counts back from yesterday while today is unanswered, and includes today once answered', () => {
    expect(noSpendStreak(run, [], TODAY)).toEqual({ current: 3, best: 3 });
    expect(noSpendStreak([...run, log(TODAY, true)], [], TODAY)).toEqual({ current: 4, best: 4 });
  });

  it('ends when today was a spending day', () => {
    expect(noSpendStreak([...run, log(TODAY, false)], [], TODAY).current).toBe(0);
    expect(noSpendStreak(run, [spend(TODAY, 12)], TODAY)).toEqual({ current: 0, best: 3 });
  });

  it('a logged no-spend day with an expense on it does not count', () => {
    expect(noSpendStreak(run, [spend('2026-10-13', 30)], TODAY)).toEqual({ current: 1, best: 1 });
  });

  it('badges come from the best streak', () => {
    expect(earnedBadges(3).map((b) => b.days)).toEqual([1, 3]);
    expect(earnedBadges(0)).toEqual([]);
  });

  it('shiftDate crosses month and year boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('XP', () => {
  it('rewards answering, a no-spend day and the micro-tasks', () => {
    const full = log(TODAY, true, { review: true, allowance: true, cash: true });
    expect(dayXp(full)).toBe(XP.checkIn + XP.noSpend + 3 * XP.task + XP.allTasks);
    expect(dayXp(log(TODAY, null, { review: true }))).toBe(XP.task);
    expect(dayXp(full, new Set([TODAY]))).toBe(XP.checkIn + 3 * XP.task + XP.allTasks);
  });

  it('levels every 200 XP', () => {
    const logs = Array.from({ length: 4 }, (_, i) => log(shiftDate(TODAY, -i), true, { review: true, allowance: true, cash: true }));
    const total = 4 * (XP.checkIn + XP.noSpend + 3 * XP.task + XP.allTasks); // 4 × 75 = 300
    expect(experience(logs, [])).toMatchObject({ xp: total, level: 2, intoLevel: total - 200, toNext: 100 });
  });
});

describe('daily allowance', () => {
  const lines = budgetLines(BUDGET, PROFILE);
  // Flexible month: 7000 − (2200 + 180 + 60 + 150 + 300 reserve) − 1000 goal = 3110; Oct has 31 days.
  const base = { budget: BUDGET, profile: PROFILE, lines, savingsGoal: 1000, today: TODAY };

  it('spreads what is left over the days left, counting fixed-line overruns', () => {
    const transactions = [spend('2026-10-05', 100), spend(TODAY, 50, 'shopping'), spend('2026-10-01', 2300, 'rent'), spend('2026-09-30', 999)];
    const result = dailyAllowance({ ...base, transactions });
    // (3110 − 100 dining − 100 rent overrun) / 17 days = 171.2
    expect(result).toMatchObject({ monthlyFlexible: 3110, dailyAverage: 100, allowance: 171, spentToday: 50, remainingToday: 121, daysLeft: 17, status: 'ok' });
  });

  it('flags going over today', () => {
    const result = dailyAllowance({ ...base, transactions: [spend(TODAY, 200)] });
    expect(result).toMatchObject({ allowance: 183, status: 'over', overBy: 17, overAverageBy: 100 });
    expect(feedbackBadges({ streak: { current: 0 }, allowance: result })[0].text).toContain('חרגתם היום');
  });

  it('is empty when the plan leaves no flexible money', () => {
    expect(dailyAllowance({ ...base, savingsGoal: 5000, transactions: [] })).toMatchObject({ monthlyFlexible: 0, allowance: 0, status: 'empty' });
  });

  it('celebrates a streak', () => {
    const allowance = dailyAllowance({ ...base, transactions: [] });
    expect(feedbackBadges({ streak: { current: 3 }, allowance }).map((b) => b.text)).toEqual(['🔥 3 ימים ברצף בלי הוצאות!', '✅ עוד לא הוצאתם היום']);
  });
});

describe('day logs', () => {
  it('derive one id per user and day', async () => {
    expect(await dailyLogId('u1', TODAY)).toBe(await dailyLogId('u1', TODAY));
    expect(await dailyLogId('u1', TODAY)).not.toBe(await dailyLogId('u2', TODAY));
  });

  it('patches an existing log or creates one', async () => {
    const created = await updatedLog(null, { userId: 'u1', date: TODAY, patch: { noSpend: true }, now: 5 });
    expect(created).toMatchObject({ date: TODAY, noSpend: true, tasks: emptyTasks(), updatedAt: 5, deletedAt: null });
    const next = await updatedLog(created, { userId: 'u1', date: TODAY, patch: { tasks: { review: true } }, now: 6 });
    expect(next).toMatchObject({ id: created.id, noSpend: true, tasks: { review: true, allowance: false, cash: false }, updatedAt: 6 });
  });

  it('round-trips through the Supabase row', () => {
    const original = log(TODAY, false, { cash: true });
    const row = dailyLogToRow({ ...original, updatedAt: Date.parse('2026-10-15T08:00:00Z') }, 'u1');
    expect(row).toMatchObject({ user_id: 'u1', log_date: TODAY, no_spend: false, tasks: { review: false, allowance: false, cash: true } });
    expect(dailyLogFromRow({ ...row, updated_at: '2026-10-15T08:00:01Z' })).toMatchObject({ date: TODAY, noSpend: false, tasks: { cash: true }, syncedAt: Date.parse('2026-10-15T08:00:01Z') });
  });
});
