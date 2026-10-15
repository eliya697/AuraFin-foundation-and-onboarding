import { describe, expect, it } from 'vitest';
import {
  availableMonths,
  categoryBreakdown,
  currentMonth,
  foldForChart,
  monthlyTrend,
  plannedFor,
  recentMonths,
  shiftMonth,
} from '../src/lib/analytics.js';

const tx = (occurredOn, amount, budgetKey = 'dining', kind = 'expense') => ({ occurredOn, amount, budgetKey, kind, deletedAt: null });
const lines = [
  { key: 'rent', label: 'שכר דירה' },
  { key: 'dining', label: 'אוכל בחוץ' },
  { key: 'shopping', label: 'קניות' },
  { key: 'custom:gym', label: 'חדר כושר' },
  { key: 'other', label: 'לא מתוכנן' },
];
const budget = { rent: '3000', dining: '500', shopping: '', custom: [{ id: 'gym', title: 'חדר כושר', amount: '200' }] };

describe('months', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-10', -13)).toBe('2025-09');
  });
  it('lists the window oldest first', () => {
    expect(recentMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('uses the local calendar month', () => {
    expect(currentMonth(new Date(2026, 9, 31, 23, 50))).toBe('2026-10');
  });
});

describe('monthlyTrend', () => {
  it('sums income and expenses per month and keeps empty months', () => {
    const list = [tx('2026-10-01', 9000, 'income', 'income'), tx('2026-10-02', 120.1), tx('2026-10-20', 79.9), tx('2026-08-05', 50), tx('2026-01-01', 999)];
    expect(monthlyTrend(list, { endMonth: '2026-10', count: 3 })).toEqual([
      { month: '2026-08', income: 0, expenses: 50, net: -50 },
      { month: '2026-09', income: 0, expenses: 0, net: 0 },
      { month: '2026-10', income: 9000, expenses: 200, net: 8800 },
    ]);
  });
});

describe('plannedFor', () => {
  it('reads scalar fields, custom expenses and treats other/income as unplanned', () => {
    expect(plannedFor('rent', budget)).toBe(3000);
    expect(plannedFor('shopping', budget)).toBe(0);
    expect(plannedFor('custom:gym', budget)).toBe(200);
    expect(plannedFor('custom:gone', budget)).toBe(0);
    expect(plannedFor('other', budget)).toBe(0);
  });
});

describe('categoryBreakdown', () => {
  const list = [
    tx('2026-10-01', 3000, 'rent'),
    tx('2026-10-03', 400),
    tx('2026-10-09', 250),
    tx('2026-10-04', 80, 'custom:deleted'), // removed line → "other"
    tx('2026-10-05', 9000, 'income', 'income'),
    tx('2026-09-30', 700), // other month
  ];

  it('compares planned and actual per line for the month', () => {
    const result = categoryBreakdown(list, '2026-10', lines, budget);
    expect(result.totalExpenses).toBe(3730);
    expect(result.totalIncome).toBe(9000);
    expect(result.rows.map((r) => [r.key, r.actual, r.planned, r.over])).toEqual([
      ['rent', 3000, 3000, false],
      ['dining', 650, 500, true],
      ['other', 80, 0, false],
      ['custom:gym', 0, 200, false],
    ]);
    expect(result.plannedTotal).toBe(3700);
    expect(result.rows[0].share).toBeCloseTo(3000 / 3730);
  });

  it('is empty for a month without data or plan', () => {
    expect(categoryBreakdown([], '2026-10', lines, {}).rows).toEqual([]);
  });
});

describe('foldForChart', () => {
  it('keeps the top lines and folds the rest into one bar', () => {
    const rows = [5, 4, 3, 2, 1].map((n, i) => ({ key: `k${i}`, label: `l${i}`, actual: n, planned: 1, share: n / 15, over: false }));
    const folded = foldForChart(rows, 3);
    expect(folded.map((r) => [r.key, r.actual])).toEqual([
      ['k0', 5],
      ['k1', 4],
      ['rest', 6],
    ]);
    expect(folded[2].label).toBe('שאר הסעיפים (3)');
    expect(foldForChart(rows, 7)).toHaveLength(5);
  });
  it('leaves out lines with a plan but no spending', () => {
    expect(foldForChart([{ key: 'a', actual: 0, planned: 5 }])).toEqual([]);
  });
});

describe('availableMonths', () => {
  it('offers the current month and months with data, newest first, never the future', () => {
    const list = [tx('2026-08-01', 1), tx('2026-10-01', 1), tx('2026-12-01', 1)];
    expect(availableMonths(list, '2026-11')).toEqual(['2026-11', '2026-10', '2026-08']);
  });
});
