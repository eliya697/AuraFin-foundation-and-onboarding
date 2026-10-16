import { activeScalarFields } from './budget.js';
import { monthOf, plannedFor } from './analytics.js';
import { INCOME_KEY, OTHER_KEY, resolveLineKey, todayISO } from './transactions.js';
import { FIELDS } from './catalog.js';

/**
 * Smart budget from real spending (see tests/budgetSuggestion.test.js): the average monthly amount
 * per budget line over the months the transactions cover, compared with the plan, so the user can
 * adopt the numbers in the budget gate in one tap.
 *
 * Months: every calendar month from the first to the last transaction. The current month is left out
 * while it is still running (unless it is the only one), so a half month doesn't pull averages down.
 * The "unexpected" reserve is a cushion, not a spending pattern, so it is never suggested.
 */

const NOT_SUGGESTED = new Set([INCOME_KEY, 'unexpected']);
const roundTo10 = (n) => Math.round(n / 10) * 10;

function monthRange(first, last) {
  const months = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** The months averaged over, or [] when there are no transactions. */
export function coveredMonths(transactions, today = todayISO()) {
  const live = transactions.filter((tx) => !tx.deletedAt);
  if (!live.length) return [];
  const dates = live.map((tx) => tx.occurredOn).sort();
  const months = monthRange(monthOf(dates[0]), monthOf(dates[dates.length - 1]));
  const running = monthOf(today);
  return months.length > 1 ? months.filter((month) => month !== running) : months;
}

/**
 * { months, rows, income, unplanned, projectedSavings }
 *   rows: [{ key, label, current, suggested, average, changed }] per expense line of the budget
 *   income: { current, suggested } (suggested null when there were no income transactions)
 *   unplanned: average monthly spending that fits no line ("other")
 *   projectedSavings: income − all suggested lines − the unexpected reserve
 */
export function suggestBudget(transactions, { budget, profile, lines, today = todayISO() }) {
  const months = coveredMonths(transactions, today);
  const window = new Set(months);
  const totals = new Map();
  let income = 0;
  let hasIncome = false;
  for (const tx of transactions) {
    if (tx.deletedAt || !window.has(monthOf(tx.occurredOn))) continue;
    if (tx.kind === 'income') {
      income += tx.amount;
      hasIncome = true;
      continue;
    }
    const key = resolveLineKey(tx, lines);
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  const count = Math.max(1, months.length);
  const average = (key) => (totals.get(key) ?? 0) / count;

  const rows = lines
    .filter((line) => line.key !== OTHER_KEY && !NOT_SUGGESTED.has(line.key))
    .map((line) => {
      const current = plannedFor(line.key, budget);
      const avg = average(line.key);
      const suggested = avg > 0 ? Math.max(10, roundTo10(avg)) : current;
      // Worth proposing: at least ₪20 and 5% away from the plan.
      const changed = avg > 0 && Math.abs(suggested - current) >= Math.max(20, current * 0.05);
      return { key: line.key, label: line.label, current, suggested, average: Math.round(avg), changed };
    });

  const currentIncome = Number(budget?.income) || 0;
  const suggestedIncome = hasIncome ? roundTo10(income / count) : null;
  const reserve = activeScalarFields(profile).includes('unexpected') ? Number(budget?.unexpected) || 0 : 0;
  const plannedTotal = rows.reduce((sum, row) => sum + row.suggested, 0) + reserve;

  return {
    months,
    rows,
    income: { current: currentIncome, suggested: suggestedIncome },
    unplanned: Math.round(average(OTHER_KEY)),
    projectedSavings: (suggestedIncome ?? currentIncome) - plannedTotal,
  };
}

/**
 * The budget with the accepted suggestions applied (amounts as strings, like the gate's inputs).
 * `accepted`: keys from suggestion.rows, plus 'income' to adopt the income average.
 */
export function applyBudgetSuggestion(budget, suggestion, accepted) {
  const take = new Set(accepted);
  const next = { ...budget, custom: (budget.custom ?? []).map((item) => ({ ...item })) };
  for (const row of suggestion.rows) {
    if (!take.has(row.key)) continue;
    if (row.key.startsWith('custom:')) {
      const id = row.key.slice('custom:'.length);
      const item = next.custom.find((c) => c.id === id);
      if (item) item.amount = String(row.suggested);
    } else if (FIELDS[row.key]) {
      next[row.key] = String(row.suggested);
    }
  }
  if (take.has(INCOME_KEY) && suggestion.income.suggested > 0) next.income = String(suggestion.income.suggested);
  return next;
}
