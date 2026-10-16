import { describe, expect, it } from 'vitest';
import { applyBudgetSuggestion, coveredMonths, suggestBudget } from '../src/lib/budgetSuggestion.js';
import { budgetLines } from '../src/lib/transactions.js';
import { BUDGET, PROFILE } from './fixtures.js';

let n = 0;
const tx = (occurredOn, amount, budgetKey, kind = 'expense') => ({
  id: `t${(n += 1)}`,
  kind,
  amount,
  budgetKey: kind === 'income' ? 'income' : budgetKey,
  merchant: '',
  note: '',
  occurredOn,
  source: 'csv',
  importHash: null,
  updatedAt: 1,
  deletedAt: null,
});

const lines = budgetLines(BUDGET, PROFILE);
const TODAY = '2026-10-15';

const history = [
  tx('2026-08-03', 1500, 'dining'),
  tx('2026-09-04', 1300, 'dining'),
  tx('2026-08-10', 520, 'shopping'),
  tx('2026-09-11', 480, 'shopping'),
  tx('2026-08-20', 200, 'other'),
  tx('2026-08-01', 7500, null, 'income'),
  tx('2026-09-01', 7500, null, 'income'),
];

describe('budget suggestion from actual spending', () => {
  it('averages over the covered months and leaves a running month out', () => {
    expect(coveredMonths(history, TODAY)).toEqual(['2026-08', '2026-09']);
    expect(coveredMonths([...history, tx('2026-10-02', 90, 'dining')], TODAY)).toEqual(['2026-08', '2026-09']);
    expect(coveredMonths([tx('2026-10-02', 90, 'dining')], TODAY)).toEqual(['2026-10']);
    expect(coveredMonths([], TODAY)).toEqual([]);
  });

  it('proposes lines that differ from the plan, plus income and the projected savings', () => {
    const suggestion = suggestBudget(history, { budget: BUDGET, profile: PROFILE, lines, today: TODAY });
    const byKey = Object.fromEntries(suggestion.rows.map((row) => [row.key, row]));
    expect(byKey.dining).toMatchObject({ current: 1100, suggested: 1400, average: 1400, changed: true });
    expect(byKey.shopping).toMatchObject({ current: 500, suggested: 500, changed: false });
    expect(byKey.rent).toMatchObject({ current: 2200, suggested: 2200, changed: false }); // no data: keep the plan
    expect(byKey.unexpected).toBeUndefined(); // a reserve, never suggested
    expect(suggestion.income).toEqual({ current: 7000, suggested: 7500 });
    expect(suggestion.unplanned).toBe(100);
    // 7500 − (2200 + 180 + 60 + 150 + 450 + 1400 + 500) − 300 reserve
    expect(suggestion.projectedSavings).toBe(2260);
  });

  it('applies only the accepted suggestions, as gate strings', () => {
    const suggestion = suggestBudget(history, { budget: BUDGET, profile: PROFILE, lines, today: TODAY });
    const next = applyBudgetSuggestion(BUDGET, suggestion, ['dining', 'income']);
    expect(next).toMatchObject({ dining: '1400', income: '7500', shopping: '500', rent: '2200' });
    expect(BUDGET.dining).toBe('1100'); // not mutated
  });

  it('updates custom expense amounts', () => {
    const budget = { ...BUDGET, custom: [{ id: 'gym', title: 'חדר כושר', amount: '150' }] };
    const customLines = budgetLines(budget, PROFILE);
    const suggestion = suggestBudget([tx('2026-09-02', 230, 'custom:gym')], { budget, profile: PROFILE, lines: customLines, today: TODAY });
    expect(suggestion.rows.find((row) => row.key === 'custom:gym')).toMatchObject({ suggested: 230, changed: true });
    expect(applyBudgetSuggestion(budget, suggestion, ['custom:gym']).custom[0].amount).toBe('230');
  });
});
