import { describe, expect, it } from 'vitest';
import { PDF_HEADERS, groupTextItems, isPdfFile, rowsFromPdfLines } from '../src/lib/pdfStatement.js';
import { buildPreview, guessMapping, guessPositiveIs, reviseItem, withFingerprints } from '../src/lib/csvImport.js';

const item = (str, x, y, width = 40) => ({ str, transform: [1, 0, 0, 10, x, y], width, height: 10 });

describe('PDF statements', () => {
  it('detects PDFs by magic bytes or name', () => {
    expect(isPdfFile(new TextEncoder().encode('%PDF-1.7 ...'))).toBe(true);
    expect(isPdfFile(new Uint8Array([1, 2, 3, 4]), 'דף חשבון.PDF')).toBe(true);
    expect(isPdfFile(new TextEncoder().encode('date,amount'), 'max.csv')).toBe(false);
  });

  it('groups text items into lines and cells, Hebrew lines in reading order', () => {
    const lines = groupTextItems([
      item('123.40', 300, 700),
      item('שופר', 400, 700, 20),
      item('סל', 420.5, 700.5, 15),
      item('15/10/2026', 500, 700),
      item('42.00', 300, 680),
      item('16/10/2026', 500, 680),
    ]);
    expect(lines).toEqual([
      ['15/10/2026', 'שופרסל', '123.40'],
      ['16/10/2026', '42.00'],
    ]);
  });

  it('keeps only lines with a date and an amount, and drops reference numbers', () => {
    const { headers, rows } = rowsFromPdfLines([
      ['פירוט עסקאות לכרטיס 1234'],
      ['תאריך', 'שם בית העסק', 'סכום'],
      ['15/10/2026', 'שופרסל דיל', '123.40'],
      ['16/10/26', '17/10/26', 'פז ילו', '1,250.00', '1,250.00'],
      ['01/10/2026', 'העברה', '123456789', '-500.00', '12,000.00'],
      ['סה"כ לחיוב', '1,373.40'],
    ]);
    expect(headers).toEqual(PDF_HEADERS);
    expect(rows).toEqual([
      ['15/10/2026', 'שופרסל דיל', '123.40', '', ''],
      ['16/10/26', 'פז ילו', '1,250.00', '1,250.00', ''],
      ['01/10/2026', 'העברה', '-500.00', '12,000.00', ''],
    ]);
  });

  it('feeds the CSV pipeline unchanged', () => {
    const { headers, rows } = rowsFromPdfLines([
      ['15/10/2026', 'שופרסל דיל', '123.40'],
      ['16/10/2026', 'זיכוי', '-20.00'],
    ]);
    const all = [headers, ...rows];
    const mapping = guessMapping(headers);
    expect(mapping).toMatchObject({ date: 0, merchant: 1, amount: 2, amountMode: 'signed' });
    const positiveIs = guessPositiveIs(all, 0, mapping);
    expect(positiveIs).toBe('expense');
    expect(buildPreview(all, 0, mapping, { positiveIs })).toMatchObject([
      { occurredOn: '2026-10-15', merchant: 'שופרסל דיל', amount: 123.4, kind: 'expense', error: null },
      { occurredOn: '2026-10-16', merchant: 'זיכוי', amount: 20, kind: 'income', error: null },
    ]);
  });
});

describe('fixing preview rows', () => {
  it('a broken row becomes importable with its own fingerprint', async () => {
    const broken = { line: 4, occurredOn: null, amount: 10, kind: 'expense', merchant: 'שבור', note: '', error: 'חסר תאריך', importHash: null, id: null, selected: false, budgetKey: 'other' };
    const fixed = await reviseItem(broken, { occurredOn: '2026-10-03' }, 'u1');
    expect(fixed).toMatchObject({ error: null, selected: true, edited: true, occurredOn: '2026-10-03' });
    expect(fixed.importHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fixed.id).toMatch(/^[0-9a-f-]{36}$/);
    // Fixing the same row the same way again (re-importing the file) gives the same row.
    expect((await reviseItem(broken, { occurredOn: '2026-10-03' }, 'u1')).id).toBe(fixed.id);
  });

  it('a valid row keeps the fingerprint of the file line; bad edits are rejected', async () => {
    const [valid] = await withFingerprints([{ line: 2, occurredOn: '2026-10-01', amount: 50, kind: 'expense', merchant: 'פיצה', note: '', error: null }], 'u1');
    const edited = await reviseItem({ ...valid, selected: true }, { amount: '55.5', kind: 'income' }, 'u1');
    expect(edited).toMatchObject({ amount: 55.5, kind: 'income', budgetKey: 'income', importHash: valid.importHash, id: valid.id });
    const bad = await reviseItem(valid, { amount: '0' }, 'u1');
    expect(bad).toMatchObject({ error: 'סכום 0', selected: false });
  });
});
