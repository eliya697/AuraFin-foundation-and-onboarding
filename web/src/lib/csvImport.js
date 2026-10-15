import { INCOME_KEY, OTHER_KEY, TX_LIMITS, isValidDate } from './transactions.js';

/**
 * Bank / credit-card CSV import, as pure functions (see tests/csvImport.test.js):
 *
 *   decodeBytes → parseCsv → findHeaderRow → guessMapping → buildPreview → markDuplicates
 *   → suggestBudgetKeys → toTransactions (async: ids and fingerprints are SHA-256 based)
 *
 * Israeli exports come as UTF-8 (often with a BOM) or windows-1255, use `,` `;` or tab, put a few
 * title lines above the header, write dates as dd/mm/yyyy and amounts as "1,234.50" or "-1,234.50".
 * Credit-card files list charges as positive numbers; bank files use a signed column or separate
 * debit (חובה) / credit (זכות) columns.
 */

export const IMPORT_LIMITS = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxRows: 5000 });

// ─── Decoding ────────────────────────────────────────────────

/** UTF-8 (BOM-aware) when the bytes are valid UTF-8, otherwise windows-1255 (Hebrew Windows). */
export function decodeBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1255').decode(body), encoding: 'windows-1255' };
  }
}

// ─── CSV parsing ─────────────────────────────────────────────

const DELIMITERS = [',', ';', '\t'];

/** The delimiter that splits the first lines into the most (and most consistent) columns. */
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => parseCsv(line, delimiter)[0]?.length ?? 0).filter((n) => n > 1);
    if (!counts.length) continue;
    const mode = mostCommon(counts);
    const score = counts.filter((n) => n === mode).length * mode;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function mostCommon(values) {
  const tally = new Map();
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** RFC 4180-ish: quoted fields, "" escapes, CRLF/LF, newlines inside quotes. */
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((cell) => cell.trim()));
}

// ─── Header detection & column mapping ───────────────────────

const normalizeHeader = (value) =>
  String(value ?? '')
    .replace(/﻿/g, '')
    .replace(/[״"'׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Ordered by preference: the first pattern that matches any header wins.
const SYNONYMS = {
  date: ['תאריך עסקה', 'תאריך העסקה', 'תאריך רכישה', 'תאריך', 'תאריך ערך', 'transaction date', 'date'],
  merchant: ['שם בית העסק', 'שם בית עסק', 'בית העסק', 'בית עסק', 'תיאור', 'תאור', 'תיאור הפעולה', 'הפעולה', 'פרטים', 'merchant', 'description', 'payee', 'details'],
  amount: ['סכום חיוב', 'סכום החיוב', 'סכום חיוב בשח', 'סכום בשח', 'סכום', 'סכום עסקה', 'amount'],
  debit: ['חובה', 'בחובה', 'debit', 'withdrawal'],
  credit: ['זכות', 'בזכות', 'credit', 'deposit'],
  note: ['הערות', 'הערה', 'פירוט נוסף', 'notes', 'memo'],
};
const EXCLUDE = { amount: ['יתרה', 'מקורי', 'מטבע'], date: ['חיוב'] };

/** Exact header match first, then partial; headers with an EXCLUDE word only as a last resort. */
function findColumn(headers, field, taken) {
  const normalized = headers.map(normalizeHeader);
  const preferred = (h) => !(EXCLUDE[field] ?? []).some((bad) => h.includes(bad));
  for (const strict of [true, false]) {
    const allowed = (h, i) => !taken.has(i) && (!strict || preferred(h));
    for (const pattern of SYNONYMS[field]) {
      const exact = normalized.findIndex((h, i) => h === pattern && allowed(h, i));
      if (exact >= 0) return exact;
    }
    for (const pattern of SYNONYMS[field]) {
      const partial = normalized.findIndex((h, i) => h.includes(pattern) && allowed(h, i));
      if (partial >= 0) return partial;
    }
  }
  return null;
}

/** Index of the header row: the first row (of the first 30) that names a date and an amount column. */
export function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i].filter(Boolean);
    if (cells.length < 2) continue;
    const mapping = guessMapping(rows[i]);
    if (mapping.date !== null && (mapping.amount !== null || mapping.debit !== null)) return i;
  }
  const firstWide = rows.findIndex((row) => row.filter(Boolean).length >= 3);
  return firstWide >= 0 ? firstWide : 0;
}

/** Column indexes per field (null = not found). Separate debit/credit columns win over a single amount. */
export function guessMapping(headers) {
  const taken = new Set();
  const pick = (field) => {
    const index = findColumn(headers, field, taken);
    if (index !== null) taken.add(index);
    return index;
  };
  const date = pick('date');
  const debit = pick('debit');
  const credit = pick('credit');
  const split = debit !== null && credit !== null;
  const amount = split ? null : pick('amount');
  const merchant = pick('merchant');
  const note = pick('note');
  return {
    date,
    merchant,
    amountMode: split ? 'split' : 'signed',
    amount,
    debit: split ? debit : null,
    credit: split ? credit : null,
    note,
  };
}

/** Whether the mapping has what buildPreview needs. */
export function isMappingComplete(mapping) {
  if (mapping.date === null || mapping.date === undefined) return false;
  return mapping.amountMode === 'split' ? mapping.debit !== null || mapping.credit !== null : mapping.amount !== null;
}

// ─── Values ──────────────────────────────────────────────────

/** "₪1,234.50", "-1,234.50", "1,234.50-", "(1,234.50)", "1 234,50"? → number (null if not a number). */
export function parseAmount(raw) {
  let s = String(raw ?? '')
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/₪|ש"ח|ש״ח|nis|ils/gi, '')
    .replace(/\s/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  // A comma followed by exactly two digits at the end is a decimal comma (European style).
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  return negative ? -value : value;
}

const pad = (n) => String(n).padStart(2, '0');

/** dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy (Israeli day-first), or ISO yyyy-mm-dd, optionally with a time. */
export function parseDate(raw) {
  const s = String(raw ?? '').trim().split(/[\sT]/)[0];
  let y;
  let m;
  let d;
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [, y, m, d] = match.map(Number);
  else {
    match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!match) return null;
    [, d, m, y] = match.map(Number);
    if (y < 100) y += 2000;
  }
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isValidDate(iso) ? iso : null;
}

const SUMMARY_RE = /סה"?כ|סה״כ|total|יתרה/i;
export const normalizeMerchant = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Data rows → preview items: { line, occurredOn, amount, kind, merchant, note, error }.
 * `positiveIs` (signed mode): what a positive number means — 'expense' (credit-card charges) or
 * 'income' (bank statement). Empty and summary rows are skipped; malformed rows carry an `error`.
 */
export function buildPreview(rows, headerIndex, mapping, { positiveIs = 'expense' } = {}) {
  const items = [];
  const cell = (row, index) => (index === null || index === undefined ? '' : row[index] ?? '');
  for (let i = headerIndex + 1; i < rows.length && items.length < IMPORT_LIMITS.maxRows; i += 1) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;
    const rawDate = cell(row, mapping.date);
    const merchant = cell(row, mapping.merchant).slice(0, TX_LIMITS.merchant);
    if (!rawDate && row.some((c) => SUMMARY_RE.test(c))) continue;

    let signed = null; // negative = money out
    if (mapping.amountMode === 'split') {
      const out = parseAmount(cell(row, mapping.debit));
      const inn = parseAmount(cell(row, mapping.credit));
      if (out) signed = -Math.abs(out);
      else if (inn) signed = Math.abs(inn);
      else if (out === 0 || inn === 0) signed = 0;
    } else {
      const value = parseAmount(cell(row, mapping.amount));
      if (value !== null) signed = positiveIs === 'expense' ? -value : value;
    }

    const occurredOn = parseDate(rawDate);
    const base = { line: i + 1, occurredOn, merchant, note: cell(row, mapping.note).slice(0, TX_LIMITS.note) };
    let error = null;
    if (!occurredOn) error = rawDate ? `תאריך לא מזוהה: ${rawDate}` : 'חסר תאריך';
    else if (signed === null) error = 'סכום לא מזוהה';
    else if (signed === 0) error = 'סכום 0';
    else if (Math.abs(signed) > TX_LIMITS.maxAmount) error = 'סכום גבוה מדי';
    if (!occurredOn && signed === null && !merchant) continue; // a footer / blank-ish line

    items.push({
      ...base,
      amount: signed === null ? null : Math.round(Math.abs(signed) * 100) / 100,
      kind: signed !== null && signed > 0 ? 'income' : 'expense',
      error,
    });
  }
  return items;
}

/** Guess for `positiveIs`: credit-card files are mostly positive charges, bank files mostly negative. */
export function guessPositiveIs(rows, headerIndex, mapping) {
  if (mapping.amountMode === 'split' || mapping.amount === null) return 'expense';
  let positive = 0;
  let negative = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const value = parseAmount(row[mapping.amount]);
    if (value > 0) positive += 1;
    else if (value < 0) negative += 1;
  }
  return negative > positive ? 'income' : 'expense';
}

// ─── Dedupe & conversion ─────────────────────────────────────

/**
 * Fingerprint input per item. Identical rows in one file (two coffees, same day, same price) get an
 * occurrence index so both are kept, while re-importing the same file matches both again.
 */
export function fingerprintKeys(items) {
  const seen = new Map();
  return items.map((item) => {
    if (item.error) return null;
    const base = `${item.occurredOn}|${item.kind}|${item.amount.toFixed(2)}|${normalizeMerchant(item.merchant)}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}|${occurrence}`;
  });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A stable UUID-shaped id from a hex digest (version nibble 8 = custom, RFC 9562). */
function uuidFromHex(hex) {
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Adds `importHash` (per row content) and `id` (per user + content) to valid items. The id being
 * deterministic means importing one file on two offline devices converges on the same rows instead
 * of tripping the (user_id, import_hash) unique index.
 */
export async function withFingerprints(items, userId) {
  const keys = fingerprintKeys(items);
  return Promise.all(
    items.map(async (item, i) => {
      if (!keys[i]) return { ...item, importHash: null, id: null };
      const importHash = await sha256Hex(`aurafin-import-v1|${keys[i]}`);
      const id = uuidFromHex(await sha256Hex(`${userId}|${importHash}`));
      return { ...item, importHash, id };
    }),
  );
}

/**
 * `duplicate`: imported before (same fingerprint; tombstones included, so deleted imports stay
 * deleted) — never re-imported. `similar`: same date, direction and amount as a transaction the user
 * typed in by hand — probably the same purchase, so it starts unselected but can be ticked.
 */
export function markDuplicates(items, existingTransactions) {
  const hashes = new Set(existingTransactions.map((tx) => tx.importHash).filter(Boolean));
  const manual = new Set(
    existingTransactions
      .filter((tx) => !tx.deletedAt && !tx.importHash)
      .map((tx) => `${tx.occurredOn}|${tx.kind}|${Number(tx.amount).toFixed(2)}`),
  );
  return items.map((item) => {
    const duplicate = Boolean(item.importHash && hashes.has(item.importHash));
    const similar = !duplicate && !item.error && manual.has(`${item.occurredOn}|${item.kind}|${item.amount.toFixed(2)}`);
    return { ...item, duplicate, similar };
  });
}

const words = (value) => normalizeMerchant(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The line whose name (or one of its "a / b" parts) appears in the merchant as whole words; a word may
 * carry the Hebrew definite article ("חברת החשמל" matches חשמל, "מימון" does not match מים).
 */
function lineByName(merchant, lines) {
  const merchantWords = words(merchant);
  const contains = (part) => {
    const target = words(part);
    if (!target.length) return false;
    const same = (word, w) => word === w || word === `ה${w}`;
    return merchantWords.some((_, i) => target.every((w, j) => same(merchantWords[i + j], w)));
  };
  return lines.find((line) => line.key !== OTHER_KEY && (line.label ?? '').split('/').some(contains))?.key ?? null;
}

/**
 * Budget line per item: the line the user last chose for the same merchant (learned from their
 * transactions), else a line whose name appears in the merchant ("חברת החשמל" → חשמל), else "other".
 * Income always maps to the income key.
 */
export function suggestBudgetKeys(items, existingTransactions, lines) {
  const valid = new Set(lines.map((line) => line.key));
  const learned = new Map();
  const newestFirst = [...existingTransactions].filter((tx) => !tx.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const tx of newestFirst) {
    const key = normalizeMerchant(tx.merchant);
    if (!key || learned.has(key) || tx.kind !== 'expense' || tx.budgetKey === OTHER_KEY || !valid.has(tx.budgetKey)) continue;
    learned.set(key, tx.budgetKey);
  }
  return items.map((item) => ({
    ...item,
    budgetKey:
      item.kind === 'income'
        ? INCOME_KEY
        : learned.get(normalizeMerchant(item.merchant)) ?? lineByName(item.merchant, lines) ?? OTHER_KEY,
  }));
}

/** Selected, valid, non-duplicate items → transactions ready for the outbox. */
export function toTransactions(items, { now = Date.now() } = {}) {
  return items
    .filter((item) => item.selected && !item.error && !item.duplicate && item.id)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      amount: item.amount,
      budgetKey: item.kind === 'income' ? INCOME_KEY : item.budgetKey || OTHER_KEY,
      merchant: item.merchant,
      note: item.note ?? '',
      occurredOn: item.occurredOn,
      source: 'csv',
      importHash: item.importHash,
      updatedAt: now,
      deletedAt: null,
    }));
}

/** File bytes → everything the mapping step needs. Throws a Hebrew message for unusable files. */
export function readImportFile(bytes) {
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) throw new Error('הקובץ גדול מדי (עד 5MB).');
  const { text, encoding } = decodeBytes(bytes);
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (rows.filter((row) => row.some(Boolean)).length < 2) throw new Error('לא נמצאו שורות בקובץ. ודאו שזה קובץ CSV.');
  const headerIndex = findHeaderRow(rows);
  const mapping = guessMapping(rows[headerIndex]);
  return { encoding, delimiter, rows, headerIndex, headers: rows[headerIndex], mapping, positiveIs: guessPositiveIs(rows, headerIndex, mapping) };
}
