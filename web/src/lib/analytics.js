import { INCOME_KEY, OTHER_KEY, resolveLineKey, todayISO } from './transactions.js';

/**
 * Pure aggregations for the analytics section (see tests/analytics.test.js). Inputs are the visible
 * (non-deleted) transactions; months are 'YYYY-MM' strings in the user's calendar.
 */

export const monthOf = (occurredOn) => occurredOn.slice(0, 7);
export const currentMonth = (date = new Date()) => monthOf(todayISO(date));

/** Month 'YYYY-MM' shifted by `delta` months. */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The `count` months ending at `endMonth`, oldest first. */
export function recentMonths(endMonth, count) {
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - count + 1));
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Income, expenses and net per month for the window, zeros included so the axis has no gaps. */
export function monthlyTrend(transactions, { endMonth = currentMonth(), count = 6 } = {}) {
  const months = recentMonths(endMonth, count);
  const totals = new Map(months.map((month) => [month, { month, income: 0, expenses: 0 }]));
  for (const tx of transactions) {
    const bucket = totals.get(monthOf(tx.occurredOn));
    if (!bucket) continue;
    if (tx.kind === 'income') bucket.income += tx.amount;
    else bucket.expenses += tx.amount;
  }
  return months.map((month) => {
    const { income, expenses } = totals.get(month);
    return { month, income: round2(income), expenses: round2(expenses), net: round2(income - expenses) };
  });
}

/** Planned monthly amount for a budget line (scalar field, custom:<id>, or 0 for "other"). */
export function plannedFor(key, budget) {
  if (key === OTHER_KEY || key === INCOME_KEY) return 0;
  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length);
    return Number(budget?.custom?.find((item) => item.id === id)?.amount) || 0;
  }
  return Number(budget?.[key]) || 0;
}

/**
 * Planned vs actual per budget line for one month. Lines with neither spending nor a plan are left
 * out; "other" (unplanned spending) has no plan and is never "over". Rows are sorted by actual spend.
 */
export function categoryBreakdown(transactions, month, lines, budget) {
  const actual = new Map();
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of transactions) {
    if (monthOf(tx.occurredOn) !== month) continue;
    if (tx.kind === 'income') {
      totalIncome += tx.amount;
      continue;
    }
    totalExpenses += tx.amount;
    const key = resolveLineKey(tx, lines);
    actual.set(key, (actual.get(key) ?? 0) + tx.amount);
  }
  const rows = lines
    .map((line) => {
      const spent = round2(actual.get(line.key) ?? 0);
      const planned = plannedFor(line.key, budget);
      return {
        key: line.key,
        label: line.label,
        actual: spent,
        planned,
        share: totalExpenses ? spent / totalExpenses : 0,
        over: planned > 0 && spent > planned,
      };
    })
    .filter((row) => row.actual > 0 || row.planned > 0)
    .sort((a, b) => b.actual - a.actual || b.planned - a.planned);
  const plannedTotal = rows.reduce((sum, row) => sum + row.planned, 0);
  return { rows, totalIncome: round2(totalIncome), totalExpenses: round2(totalExpenses), plannedTotal: round2(plannedTotal) };
}

/**
 * Chart rows: the top `max - 1` lines by spend, the rest folded into one "שאר הסעיפים" bar, so the
 * chart never needs more than `max` bars (the full list stays in the table below it).
 */
export function foldForChart(rows, max = 7) {
  const spent = rows.filter((row) => row.actual > 0);
  if (spent.length <= max) return spent;
  const head = spent.slice(0, max - 1);
  const tail = spent.slice(max - 1);
  return [
    ...head,
    {
      key: 'rest',
      label: `שאר הסעיפים (${tail.length})`,
      actual: round2(tail.reduce((sum, row) => sum + row.actual, 0)),
      planned: tail.reduce((sum, row) => sum + row.planned, 0),
      share: tail.reduce((sum, row) => sum + row.share, 0),
      over: false,
    },
  ];
}

/** Months the user can pick: the current one plus every month with transactions, newest first (max 12). */
export function availableMonths(transactions, nowMonth = currentMonth()) {
  const months = new Set([nowMonth, ...transactions.map((tx) => monthOf(tx.occurredOn))]);
  return [...months].filter((month) => month <= nowMonth).sort().reverse().slice(0, 12);
}

const shortMonth = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatMonth(month, style = 'short') {
  const [y, m] = month.split('-').map(Number);
  return (style === 'long' ? longMonth : shortMonth).format(new Date(Date.UTC(y, m - 1, 1)));
}
