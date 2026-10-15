import { describe, expect, it } from 'vitest';
import {
  budgetLines,
  deletedTransaction,
  formatTxAmount,
  fromRow,
  isValidDate,
  lineLabel,
  mergeTransactions,
  newDraft,
  normalizeTransaction,
  resolveLineKey,
  toRow,
  todayISO,
  transactionFromDraft,
  validateDraft,
  visibleTransactions,
} from '../src/lib/transactions.js';

const profile = { lifeStage: 'employee', goal: 'house', hasChildren: false, childrenCount: 0, trackId: 'first_home' };
const budget = { custom: [{ id: 'gym1', title: ' חדר כושר ', amount: '200' }, { id: 'blank', title: '  ', amount: '' }] };

const tx = (over = {}) => ({
  id: 'a',
  kind: 'expense',
  amount: 50,
  budgetKey: 'dining',
  merchant: 'קפה',
  note: '',
  occurredOn: '2026-10-01',
  source: 'manual',
  importHash: null,
  updatedAt: 100,
  deletedAt: null,
  ...over,
});

describe('budgetLines', () => {
  it('lists active expense fields, named custom expenses and "other"', () => {
    const keys = budgetLines(budget, profile).map((l) => l.key);
    expect(keys).not.toContain('income');
    expect(keys).not.toContain('children');
    expect(keys).toEqual(expect.arrayContaining(['rent', 'dining', 'unexpected', 'custom:gym1']));
    expect(keys).not.toContain('custom:blank');
    expect(keys.at(-1)).toBe('other');
    expect(budgetLines(budget, profile).find((l) => l.key === 'custom:gym1').label).toBe('חדר כושר');
  });

  it('includes the children line for parents', () => {
    expect(budgetLines(budget, { ...profile, hasChildren: true, childrenCount: 2 }).map((l) => l.key)).toContain('children');
  });
});

describe('resolveLineKey / lineLabel', () => {
  const lines = budgetLines(budget, profile);
  it('keeps known keys and falls back to "other" for removed lines', () => {
    expect(resolveLineKey(tx(), lines)).toBe('dining');
    expect(resolveLineKey(tx({ budgetKey: 'custom:deleted' }), lines)).toBe('other');
    expect(resolveLineKey(tx({ kind: 'income', budgetKey: 'dining' }), lines)).toBe('income');
    expect(lineLabel('custom:deleted', lines)).toBe('לא מתוכנן');
    expect(lineLabel('income', lines)).toBe('הכנסה');
  });
});

describe('dates', () => {
  it('formats the local calendar date', () => {
    expect(todayISO(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
  it('rejects impossible dates', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('5/1/2026')).toBe(false);
  });
});

describe('validateDraft', () => {
  it('requires a positive amount and a date', () => {
    expect(validateDraft({ ...newDraft(), occurredOn: '' })).toMatchObject({ amount: expect.any(String), occurredOn: expect.any(String) });
    expect(validateDraft({ ...newDraft(), amount: '0' }).amount).toBeTruthy();
    expect(validateDraft({ ...newDraft(), amount: '2000000' }).amount).toBeTruthy();
    expect(validateDraft({ ...newDraft(), amount: '12.5' })).toEqual({});
  });
  it('limits merchant and note length', () => {
    const errors = validateDraft({ ...newDraft(), amount: '1', merchant: 'x'.repeat(121), note: 'y'.repeat(281) });
    expect(Object.keys(errors).sort()).toEqual(['merchant', 'note']);
  });
});

describe('transactionFromDraft', () => {
  it('builds a new transaction with a client id', () => {
    const draft = { ...newDraft({ occurredOn: '2026-10-02' }), amount: '19.999', merchant: ' שופרסל ', budgetKey: 'shopping' };
    const result = transactionFromDraft(draft, { now: 7, newId: () => 'new-id' });
    expect(result).toEqual({
      id: 'new-id',
      kind: 'expense',
      amount: 20,
      budgetKey: 'shopping',
      merchant: 'שופרסל',
      note: '',
      occurredOn: '2026-10-02',
      source: 'manual',
      importHash: null,
      updatedAt: 7,
      deletedAt: null,
    });
  });
  it('forces the income key for income and keeps import metadata on edit', () => {
    const existing = tx({ id: 'x', source: 'csv', importHash: 'abcdef123456' });
    const result = transactionFromDraft({ ...newDraft({ kind: 'income' }), amount: '100', budgetKey: 'dining' }, { existing, now: 9 });
    expect(result).toMatchObject({ id: 'x', kind: 'income', budgetKey: 'income', source: 'csv', importHash: 'abcdef123456' });
  });
});

describe('row mapping', () => {
  it('round-trips through the Supabase row shape', () => {
    const original = tx({ updatedAt: Date.parse('2026-10-01T08:00:00Z') });
    const row = toRow(original, 'user-1');
    expect(row).toMatchObject({ user_id: 'user-1', budget_key: 'dining', occurred_at: '2026-10-01T12:00:00.000Z', deleted_at: null });
    const back = fromRow({ ...row, amount: '50.00', updated_at: '2026-10-01T08:00:01Z' });
    expect(back).toEqual({ ...original, syncedAt: Date.parse('2026-10-01T08:00:01Z') });
  });
  it('maps tombstones and drops invalid rows', () => {
    const row = toRow(deletedTransaction(tx(), 500), 'u');
    expect(fromRow({ ...row, updated_at: null }).deletedAt).toBe(500);
    expect(fromRow({ ...row, amount: -3 })).toBeNull();
  });
});

describe('normalizeTransaction', () => {
  it('rejects garbage and fills defaults', () => {
    expect(normalizeTransaction(null)).toBeNull();
    expect(normalizeTransaction({ id: 'a', amount: 'x', occurredOn: '2026-01-01' })).toBeNull();
    expect(normalizeTransaction({ id: 'a', amount: '5', occurredOn: '2026-01-01' })).toMatchObject({
      kind: 'expense',
      budgetKey: 'other',
      source: 'manual',
      deletedAt: null,
    });
  });
});

describe('mergeTransactions / visibleTransactions', () => {
  it('keeps the copy edited last and lets tombstones win over stale copies', () => {
    const local = [tx({ id: 'a', amount: 1, updatedAt: 10 }), tx({ id: 'b', updatedAt: 50 })];
    const remote = [tx({ id: 'a', amount: 2, updatedAt: 20 }), deletedTransaction(tx({ id: 'b' }), 40), tx({ id: 'c', updatedAt: 5 })];
    const merged = mergeTransactions(local, remote);
    expect(merged.find((t) => t.id === 'a').amount).toBe(2);
    expect(merged.find((t) => t.id === 'b').deletedAt).toBeNull(); // local edit (50) is newer than the remote delete (40)
    expect(merged.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('hides deleted rows and sorts newest first', () => {
    const list = [
      tx({ id: '1', occurredOn: '2026-09-01' }),
      tx({ id: '2', occurredOn: '2026-10-01', updatedAt: 1 }),
      tx({ id: '3', occurredOn: '2026-10-01', updatedAt: 2 }),
      deletedTransaction(tx({ id: '4', occurredOn: '2026-12-01' })),
    ];
    expect(visibleTransactions(list).map((t) => t.id)).toEqual(['3', '2', '1']);
  });
});

describe('formatTxAmount', () => {
  it('shows agorot only when there are any', () => {
    expect(formatTxAmount(65)).not.toMatch(/\./);
    expect(formatTxAmount(64.9)).toMatch(/64\.90/);
  });
});
