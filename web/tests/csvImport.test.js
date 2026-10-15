import { describe, expect, it } from 'vitest';
import {
  buildPreview,
  decodeBytes,
  detectDelimiter,
  fingerprintKeys,
  findHeaderRow,
  guessMapping,
  markDuplicates,
  parseAmount,
  parseCsv,
  parseDate,
  readImportFile,
  suggestBudgetKeys,
  toTransactions,
  withFingerprints,
} from '../src/lib/csvImport.js';

/** windows-1255 bytes for ASCII + Hebrew letters (א–ת map to 0xE0–0xFA). */
function encode1255(text) {
  return Uint8Array.from([...text].map((ch) => {
    const code = ch.codePointAt(0);
    if (code < 0x80) return code;
    if (code >= 0x05d0 && code <= 0x05ea) return 0xe0 + (code - 0x05d0);
    throw new Error(`not in fixture charset: ${ch}`);
  }));
}
const utf8 = (text, bom = false) => {
  const body = new TextEncoder().encode(text);
  return bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...body]) : body;
};

// Credit-card style: title lines, quoted thousands, positive charges, a refund, a total line.
const CARD_CSV = [
  'פירוט עסקאות לכרטיס 1234',
  '',
  'תאריך עסקה,שם בית העסק,סכום עסקה,סכום חיוב,תאריך חיוב,הערות',
  '01/10/2026,שופרסל דיל,"1,234.50","1,234.50",10/11/2026,',
  '02/10/2026,ארומה,18,18,10/11/2026,',
  '02/10/2026,ארומה,18,18,10/11/2026,',
  '05/10/26,זיכוי - ספורט,-120,-120,10/11/2026,החזר',
  ',סה"כ,,"1,150.50",,',
].join('\r\n');

// Bank style (windows-1255, ; delimiter): separate debit/credit columns.
const BANK_CSV = ['תאריך;תאור;חובה;זכות;יתרה', '03.10.2026;משכורת;;9500.00;12000', '04.10.2026;חשמל;350.20;;11649.80'].join('\n');

describe('decodeBytes', () => {
  it('reads UTF-8 with and without a BOM', () => {
    expect(decodeBytes(utf8('תאריך,סכום', true))).toEqual({ text: 'תאריך,סכום', encoding: 'utf-8' });
    expect(decodeBytes(utf8('תאריך,סכום'))).toEqual({ text: 'תאריך,סכום', encoding: 'utf-8' });
  });
  it('falls back to windows-1255 for Hebrew Windows exports', () => {
    expect(decodeBytes(encode1255('תאריך;חובה'))).toEqual({ text: 'תאריך;חובה', encoding: 'windows-1255' });
  });
});

describe('parseCsv / detectDelimiter', () => {
  it('handles quotes, escaped quotes, CRLF and newlines inside quotes', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n"x\ny",2', ',')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['x\ny', '2'],
    ]);
  });
  it('detects , ; and tab', () => {
    expect(detectDelimiter(CARD_CSV)).toBe(',');
    expect(detectDelimiter(BANK_CSV)).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
});

describe('values', () => {
  it.each([
    ['1,234.50', 1234.5],
    ['₪ 18', 18],
    ['-120', -120],
    ['120-', -120],
    ['(45.10)', -45.1],
    ['1.234,50', 1234.5],
    ['12,5', 12.5],
    ['', null],
    ['abc', null],
  ])('parseAmount(%j) = %j', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each([
    ['01/10/2026', '2026-10-01'],
    ['5/1/26', '2026-01-05'],
    ['03.10.2026', '2026-10-03'],
    ['2026-10-03', '2026-10-03'],
    ['31/02/2026', null],
    ['01/10/2026 14:22', '2026-10-01'],
    ['', null],
  ])('parseDate(%j) = %j', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });
});

describe('header detection and mapping', () => {
  it('skips title lines and prefers the charged amount and the purchase date', () => {
    const rows = parseCsv(CARD_CSV, ',');
    const header = findHeaderRow(rows);
    expect(header).toBe(2);
    expect(guessMapping(rows[header])).toEqual({ date: 0, merchant: 1, amountMode: 'signed', amount: 3, debit: null, credit: null, note: 5 });
  });
  it('maps separate debit/credit columns and ignores the balance', () => {
    const rows = parseCsv(BANK_CSV, ';');
    expect(guessMapping(rows[0])).toEqual({ date: 0, merchant: 1, amountMode: 'split', amount: null, debit: 2, credit: 3, note: null });
  });
});

describe('readImportFile + buildPreview', () => {
  it('turns a credit-card export into expenses and a refund, skipping the total line', () => {
    const file = readImportFile(utf8(CARD_CSV, true));
    expect(file).toMatchObject({ encoding: 'utf-8', delimiter: ',', headerIndex: 2, positiveIs: 'expense' });
    const items = buildPreview(file.rows, file.headerIndex, file.mapping, { positiveIs: file.positiveIs });
    expect(items.map((i) => [i.occurredOn, i.merchant, i.kind, i.amount, i.error])).toEqual([
      ['2026-10-01', 'שופרסל דיל', 'expense', 1234.5, null],
      ['2026-10-02', 'ארומה', 'expense', 18, null],
      ['2026-10-02', 'ארומה', 'expense', 18, null],
      ['2026-10-05', 'זיכוי - ספורט', 'income', 120, null],
    ]);
    expect(items[3].note).toBe('החזר');
  });

  it('reads a windows-1255 bank export with debit/credit columns', () => {
    const file = readImportFile(encode1255(BANK_CSV));
    expect(file.encoding).toBe('windows-1255');
    const items = buildPreview(file.rows, file.headerIndex, file.mapping);
    expect(items.map((i) => [i.occurredOn, i.merchant, i.kind, i.amount])).toEqual([
      ['2026-10-03', 'משכורת', 'income', 9500],
      ['2026-10-04', 'חשמל', 'expense', 350.2],
    ]);
  });

  it('treats positives as income for signed bank statements', () => {
    const csv = 'תאריך,תיאור,סכום\n01/10/2026,משכורת,9000\n02/10/2026,סופר,-200\n03/10/2026,דלק,-150';
    const file = readImportFile(utf8(csv));
    expect(file.positiveIs).toBe('income');
    const items = buildPreview(file.rows, file.headerIndex, file.mapping, { positiveIs: 'income' });
    expect(items.map((i) => i.kind)).toEqual(['income', 'expense', 'expense']);
  });

  it('reports bad rows instead of dropping them', () => {
    const csv = 'תאריך,תיאור,סכום\n99/99/2026,א,10\n01/10/2026,ב,abc\n01/10/2026,ג,0';
    const file = readImportFile(utf8(csv));
    const items = buildPreview(file.rows, file.headerIndex, file.mapping);
    expect(items.map((i) => i.error)).toEqual(['תאריך לא מזוהה: 99/99/2026', 'סכום לא מזוהה', 'סכום 0']);
  });

  it('rejects files without data', () => {
    expect(() => readImportFile(utf8('just one line'))).toThrow(/לא נמצאו שורות/);
  });
});

describe('fingerprints and dedupe', () => {
  const items = () => {
    const file = readImportFile(utf8(CARD_CSV));
    return buildPreview(file.rows, file.headerIndex, file.mapping);
  };

  it('keeps identical rows in one file apart by occurrence', () => {
    const keys = fingerprintKeys(items());
    expect(keys[1]).not.toBe(keys[2]);
    expect(keys[1].replace(/\|0$/, '')).toBe(keys[2].replace(/\|1$/, ''));
  });

  it('is stable across imports and scopes ids per user', async () => {
    const first = await withFingerprints(items(), 'user-a');
    const again = await withFingerprints(items(), 'user-a');
    const other = await withFingerprints(items(), 'user-b');
    expect(again.map((i) => i.importHash)).toEqual(first.map((i) => i.importHash));
    expect(again.map((i) => i.id)).toEqual(first.map((i) => i.id));
    expect(other[0].importHash).toBe(first[0].importHash);
    expect(other[0].id).not.toBe(first[0].id);
    expect(first[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('flags rows already imported, including deleted ones, and converts the rest', async () => {
    const fingerprinted = await withFingerprints(items(), 'user-a');
    const existing = [{ importHash: fingerprinted[0].importHash, deletedAt: 5 }];
    const marked = markDuplicates(fingerprinted, existing).map((item) => ({ ...item, selected: true }));
    expect(marked.map((i) => i.duplicate)).toEqual([true, false, false, false]);

    const txs = toTransactions(marked, { now: 42 });
    expect(txs).toHaveLength(3);
    expect(txs[0]).toMatchObject({ source: 'csv', updatedAt: 42, deletedAt: null, budgetKey: 'other', importHash: fingerprinted[1].importHash });
    expect(txs[2]).toMatchObject({ kind: 'income', budgetKey: 'income' });
  });
});

describe('suggestBudgetKeys', () => {
  it('reuses the line last chosen for the same merchant', () => {
    const lines = [{ key: 'dining' }, { key: 'shopping' }, { key: 'other' }];
    const existing = [
      { merchant: 'ארומה ', kind: 'expense', budgetKey: 'shopping', updatedAt: 1 },
      { merchant: 'ארומה', kind: 'expense', budgetKey: 'dining', updatedAt: 2 },
      { merchant: 'ישן', kind: 'expense', budgetKey: 'custom:gone', updatedAt: 3 },
    ];
    const items = [
      { merchant: 'ארומה', kind: 'expense' },
      { merchant: 'ישן', kind: 'expense' },
      { merchant: 'משכורת', kind: 'income' },
    ];
    expect(suggestBudgetKeys(items, existing, lines).map((i) => i.budgetKey)).toEqual(['dining', 'other', 'income']);
  });

  it('falls back to a budget line named in the merchant, as whole words', () => {
    const lines = [
      { key: 'electricity', label: 'חשמל' },
      { key: 'water', label: 'מים' },
      { key: 'rent', label: 'שכר דירה / משכנתא' },
      { key: 'other', label: 'לא מתוכנן' },
    ];
    const items = ['חברת החשמל', 'חשמל לישראל', 'מימון ישיר', 'תאגיד מים', 'הוראת קבע משכנתא'].map((merchant) => ({ merchant, kind: 'expense' }));
    expect(suggestBudgetKeys(items, [], lines).map((i) => i.budgetKey)).toEqual(['electricity', 'electricity', 'other', 'water', 'rent']);
  });
});

describe('markDuplicates: manual entries', () => {
  it('flags rows matching a hand-typed transaction as similar, not as duplicates', async () => {
    const file = readImportFile(utf8(CARD_CSV));
    const items = await withFingerprints(buildPreview(file.rows, file.headerIndex, file.mapping), 'u');
    const existing = [
      { occurredOn: '2026-10-02', kind: 'expense', amount: 18, importHash: null, deletedAt: null },
      { occurredOn: '2026-10-01', kind: 'expense', amount: 1234.5, importHash: null, deletedAt: 9 },
    ];
    const marked = markDuplicates(items, existing);
    expect(marked.map((i) => i.similar)).toEqual([false, true, true, false]);
    expect(marked.some((i) => i.duplicate)).toBe(false);
  });
});
