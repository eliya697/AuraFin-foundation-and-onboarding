import { describe, expect, it } from 'vitest';
import { categoryOf, lineByKeyword } from '../src/lib/categorize.js';
import { suggestBudgetKeys } from '../src/lib/csvImport.js';
import { budgetLines } from '../src/lib/transactions.js';
import { BUDGET, PROFILE } from './fixtures.js';

const lines = budgetLines(BUDGET, PROFILE);
const withCar = budgetLines({ ...BUDGET, custom: [{ id: 'car', title: 'רכב ודלק', amount: '600' }] }, PROFILE);

describe('keyword categorization', () => {
  it('maps common Israeli merchants to the standard budget lines', () => {
    expect(lineByKeyword('שופרסל דיל רמת גן', lines)).toBe('shopping');
    expect(lineByKeyword('רמי לוי שיווק השקמה', lines)).toBe('shopping');
    expect(lineByKeyword('WOLT TEL AVIV', lines)).toBe('dining');
    expect(lineByKeyword('ארומה דיזנגוף', lines)).toBe('dining');
    expect(lineByKeyword('חברת החשמל לישראל', lines)).toBe('electricity');
    expect(lineByKeyword('מי אביבים', lines)).toBe('water');
    expect(lineByKeyword('עיריית תל אביב ארנונה', lines)).toBe('municipal');
    expect(lineByKeyword('הוראת קבע שכר דירה', lines)).toBe('rent');
    expect(lineByKeyword('NETFLIX.COM', lines)).toBe('entertainment');
  });

  it('matches whole words only', () => {
    expect(lineByKeyword('מימון ישיר', lines)).toBeNull(); // not מים
    expect(categoryOf('')).toBeNull();
  });

  it('uses a custom line for categories without a built-in one, else gives up', () => {
    expect(categoryOf('פז ילו רעננה')?.id).toBe('transport');
    expect(lineByKeyword('פז ילו רעננה', lines)).toBeNull();
    expect(lineByKeyword('פז ילו רעננה', withCar)).toBe('custom:car');
  });

  it('suggestBudgetKeys falls back to keywords and marks the guess', () => {
    const items = [
      { kind: 'expense', merchant: 'יוחננוף כפר סבא' },
      { kind: 'expense', merchant: 'משהו לא מוכר' },
      { kind: 'income', merchant: 'משכורת' },
    ];
    const [grocery, unknown, salary] = suggestBudgetKeys(items, [], lines);
    expect(grocery).toMatchObject({ budgetKey: 'shopping', autoCategorized: true });
    expect(unknown).toMatchObject({ budgetKey: 'other', autoCategorized: false });
    expect(salary).toMatchObject({ budgetKey: 'income', autoCategorized: false });
  });

  it('a line learned from the user wins over keywords', () => {
    const history = [{ kind: 'expense', merchant: 'יוחננוף כפר סבא', budgetKey: 'dining', updatedAt: 5, deletedAt: null }];
    const [item] = suggestBudgetKeys([{ kind: 'expense', merchant: 'יוחננוף כפר סבא' }], history, lines);
    expect(item).toMatchObject({ budgetKey: 'dining', autoCategorized: false });
  });
});
