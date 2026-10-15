import { MAX_AMOUNT } from './catalog.js';
import { previewTotals } from './budget.js';
import { isValidDate, todayISO } from './transactions.js';
import { currentMonth, monthOf, recentMonths, shiftMonth } from './analytics.js';

/**
 * Savings goals: model, validation, row mapping and projections (see tests/goals.test.js).
 *
 * A goal: { id, name, target: number, saved: number, deadline: 'YYYY-MM-DD' | null,
 *           updatedAt (device ms), deletedAt (ms | null) }
 * Synced through the same outbox as transactions (entity 'goals', table public.savings_goals).
 */

export const GOAL_LIMITS = Object.freeze({ name: 60, maxAmount: MAX_AMOUNT * 100, maxGoals: 20 });

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const round2 = (n) => Math.round(n * 100) / 100;

export function newGoalDraft() {
  return { id: null, name: '', target: '', saved: '', deadline: '' };
}

export function draftFromGoal(goal) {
  return { id: goal.id, name: goal.name, target: String(goal.target), saved: goal.saved ? String(goal.saved) : '', deadline: goal.deadline ?? '' };
}

export function validateGoalDraft(draft, today = todayISO()) {
  const errors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'תנו ליעד שם, למשל "קרן חירום".';
  else if (name.length > GOAL_LIMITS.name) errors.name = `עד ${GOAL_LIMITS.name} תווים.`;

  const target = Number(draft.target);
  if (draft.target === '') errors.target = 'כמה צריך לחסוך?';
  else if (!Number.isFinite(target) || target <= 0) errors.target = 'הסכום חייב להיות גדול מ-0.';
  else if (target > GOAL_LIMITS.maxAmount) errors.target = 'הסכום גבוה מדי.';

  const saved = draft.saved === '' ? 0 : Number(draft.saved);
  if (!Number.isFinite(saved) || saved < 0) errors.saved = 'יש להזין מספר (0 ומעלה).';
  else if (saved > GOAL_LIMITS.maxAmount) errors.saved = 'הסכום גבוה מדי.';

  if (draft.deadline) {
    if (!isValidDate(draft.deadline)) errors.deadline = 'תאריך לא תקין.';
    else if (draft.deadline <= today) errors.deadline = 'בחרו תאריך עתידי.';
  }
  return errors;
}

export function goalFromDraft(draft, { existing = null, now = Date.now(), newId = () => crypto.randomUUID() } = {}) {
  return {
    id: existing?.id ?? draft.id ?? newId(),
    name: draft.name.trim(),
    target: round2(Number(draft.target)),
    saved: round2(draft.saved === '' ? 0 : Number(draft.saved)),
    deadline: draft.deadline || null,
    updatedAt: now,
    deletedAt: null,
  };
}

export function normalizeGoal(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const target = Number(raw.target);
  if (!Number.isFinite(target) || target <= 0) return null;
  const saved = Number(raw.saved);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    target,
    saved: Number.isFinite(saved) && saved > 0 ? saved : 0,
    deadline: isValidDate(raw.deadline) ? raw.deadline : null,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    deletedAt: Number.isFinite(raw.deletedAt) ? raw.deletedAt : null,
  };
}

const toIso = (ms) => new Date(ms).toISOString();

/** App goal → public.savings_goals row (supabase/migrations/0004_transactions_goals.sql). */
export function goalToRow(goal, userId) {
  return {
    id: goal.id,
    user_id: userId,
    name: goal.name.slice(0, GOAL_LIMITS.name),
    target: goal.target,
    saved: goal.saved,
    deadline: goal.deadline,
    client_updated_at: toIso(goal.updatedAt),
    deleted_at: goal.deletedAt ? toIso(goal.deletedAt) : null,
  };
}

export function goalFromRow(row) {
  const goal = normalizeGoal({
    id: row.id,
    name: row.name,
    target: Number(row.target),
    saved: Number(row.saved),
    deadline: row.deadline,
    updatedAt: Date.parse(row.client_updated_at) || 0,
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
  });
  return goal && { ...goal, syncedAt: Date.parse(row.updated_at) || 0 };
}

export function visibleGoals(list) {
  return list
    .filter((goal) => !goal.deletedAt)
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.name.localeCompare(b.name, 'he'));
}

// ─── Projection ──────────────────────────────────────────────

export const HISTORY_MONTHS = 3;

/**
 * How much the user saves per month. From transactions: the average net (income − expenses) of the
 * last HISTORY_MONTHS complete months that have any transactions — at least two such months are
 * needed. Otherwise the budget's planned remainder (income − planned expenses) is used.
 */
export function monthlySavings(transactions, { budget, profile, today = todayISO() } = {}) {
  const thisMonth = monthOf(today);
  const window = recentMonths(shiftMonth(thisMonth, -1), HISTORY_MONTHS);
  const nets = new Map();
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const month = monthOf(tx.occurredOn);
    if (!window.includes(month)) continue;
    nets.set(month, (nets.get(month) ?? 0) + (tx.kind === 'income' ? tx.amount : -tx.amount));
  }
  if (nets.size >= 2) {
    const total = [...nets.values()].reduce((sum, n) => sum + n, 0);
    return { amount: round2(total / nets.size), source: 'actual', months: nets.size };
  }
  const planned = budget && profile ? previewTotals(budget, profile).remaining : 0;
  return { amount: round2(planned), source: 'plan', months: 0 };
}

/** Whole months from `fromMonth` to `toMonth` (0 when equal, negative when earlier). */
export function monthsBetween(fromMonth, toMonth) {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Where a goal stands at the given monthly pace (the whole monthly saving is assumed to go to this
 * goal; with several goals the dates are optimistic, which the UI says).
 *
 * status: 'done' | 'no_pace' (pace ≤ 0) | 'overdue' (deadline passed) | 'on_track' | 'behind' |
 *         'no_deadline'
 */
export function projectGoal(goal, pace, { today = todayISO() } = {}) {
  const progress = Math.min(1, goal.saved / goal.target);
  const remaining = round2(Math.max(0, goal.target - goal.saved));
  const nowMonth = monthOf(today);
  const base = { progress, remaining, monthsNeeded: null, projectedMonth: null, neededPerMonth: null };

  if (remaining === 0) return { ...base, status: 'done' };

  let neededPerMonth = null;
  let deadlinePassed = false;
  if (goal.deadline) {
    deadlinePassed = goal.deadline <= today;
    // Saving months left: this month counts, so a deadline next month leaves two deposits.
    const monthsLeft = monthsBetween(nowMonth, monthOf(goal.deadline)) + 1;
    neededPerMonth = deadlinePassed ? null : round2(remaining / Math.max(1, monthsLeft));
  }

  if (!(pace > 0)) return { ...base, neededPerMonth, status: deadlinePassed ? 'overdue' : 'no_pace' };

  const monthsNeeded = Math.ceil(remaining / pace);
  // Deposits start this month, so the goal completes in the month of the last needed deposit.
  const projectedMonth = shiftMonth(nowMonth, monthsNeeded - 1);
  const result = { ...base, monthsNeeded, projectedMonth, neededPerMonth };
  if (!goal.deadline) return { ...result, status: 'no_deadline' };
  if (deadlinePassed) return { ...result, status: 'overdue' };
  return { ...result, status: projectedMonth <= monthOf(goal.deadline) ? 'on_track' : 'behind' };
}

export { currentMonth };
