import { FIELDS, MAX_AMOUNT } from './catalog.js';
import { activeScalarFields } from './budget.js';

/**
 * Pure transaction model: shape, validation, budget-line mapping and the Supabase row mapping.
 * React-free so it can be unit-tested (see tests/transactions.test.js). Design: docs/transactions.md.
 *
 * A transaction (as the app keeps it):
 *   { id, kind: 'expense' | 'income', amount: number, budgetKey, merchant, note,
 *     occurredOn: 'YYYY-MM-DD', source: 'manual' | 'csv', importHash: string | null,
 *     updatedAt: ms epoch (device time of the last edit), deletedAt: ms epoch | null }
 */

export const TX_LIMITS = Object.freeze({ merchant: 120, note: 280, maxAmount: MAX_AMOUNT });

export const INCOME_KEY = 'income';
export const OTHER_KEY = 'other';
const OTHER_LABEL = 'לא מתוכנן';
const CUSTOM_PREFIX = 'custom:';

const customKeyOf = (id) => `${CUSTOM_PREFIX}${id}`;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date as YYYY-MM-DD (not UTC: a 00:30 purchase in Israel belongs to today). */
export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Expense lines a transaction can count against: the user's active budget fields (without income),
 * their custom expenses, then "other".
 */
export function budgetLines(budget, profile) {
  const scalars = activeScalarFields(profile)
    .filter((key) => key !== INCOME_KEY)
    .map((key) => ({ key, label: FIELDS[key]?.label ?? key }));
  const custom = (budget?.custom ?? [])
    .filter((item) => item.title?.trim())
    .map((item) => ({ key: customKeyOf(item.id), label: item.title.trim() }));
  return [...scalars, ...custom, { key: OTHER_KEY, label: OTHER_LABEL }];
}

/**
 * The line a transaction is shown under. Keys that no longer exist in the budget (a deleted custom
 * expense, the children line after the profile changed) fall back to "other" without rewriting data.
 */
export function resolveLineKey(tx, lines) {
  if (tx.kind === 'income') return INCOME_KEY;
  return lines.some((line) => line.key === tx.budgetKey) ? tx.budgetKey : OTHER_KEY;
}

export function lineLabel(key, lines) {
  if (key === INCOME_KEY) return 'הכנסה';
  return lines.find((line) => line.key === key)?.label ?? OTHER_LABEL;
}

/** A blank form draft. Amount is kept as the typed string until saved. */
export function newDraft({ kind = 'expense', budgetKey = OTHER_KEY, occurredOn = todayISO() } = {}) {
  return { id: null, kind, amount: '', budgetKey, merchant: '', note: '', occurredOn };
}

export function draftFromTransaction(tx) {
  return {
    id: tx.id,
    kind: tx.kind,
    amount: String(tx.amount),
    budgetKey: tx.budgetKey,
    merchant: tx.merchant,
    note: tx.note,
    occurredOn: tx.occurredOn,
  };
}

/** Error map ({ field: Hebrew message }) for a form draft; empty when valid. */
export function validateDraft(draft) {
  const errors = {};
  const amount = Number(draft.amount);
  if (draft.amount === '' || draft.amount === null || draft.amount === undefined) errors.amount = 'כמה זה עלה?';
  else if (!Number.isFinite(amount)) errors.amount = 'יש להזין מספר.';
  else if (amount <= 0) errors.amount = 'הסכום חייב להיות גדול מ-0.';
  else if (amount > TX_LIMITS.maxAmount) errors.amount = 'הסכום גבוה מדי. בדקו שלא נוספה ספרה.';

  if (!isValidDate(draft.occurredOn)) errors.occurredOn = 'בחרו תאריך.';
  if (draft.merchant.trim().length > TX_LIMITS.merchant) errors.merchant = `עד ${TX_LIMITS.merchant} תווים.`;
  if (draft.note.trim().length > TX_LIMITS.note) errors.note = `עד ${TX_LIMITS.note} תווים.`;
  return errors;
}

/** Turns a valid draft into a transaction, keeping import metadata when editing an existing one. */
export function transactionFromDraft(draft, { existing = null, now = Date.now(), newId = () => crypto.randomUUID() } = {}) {
  const income = draft.kind === 'income';
  return {
    id: existing?.id ?? draft.id ?? newId(),
    kind: income ? 'income' : 'expense',
    amount: Math.round(Number(draft.amount) * 100) / 100,
    budgetKey: income ? INCOME_KEY : draft.budgetKey || OTHER_KEY,
    merchant: draft.merchant.trim(),
    note: draft.note.trim(),
    occurredOn: draft.occurredOn,
    source: existing?.source ?? 'manual',
    importHash: existing?.importHash ?? null,
    updatedAt: now,
    deletedAt: null,
  };
}

/** A tombstone: deletions are soft so they reach the user's other devices. */
export function deletedTransaction(tx, now = Date.now()) {
  return { ...tx, updatedAt: now, deletedAt: now };
}

/** Accepts anything (stored JSON, garbage) and returns a valid transaction or null. */
export function normalizeTransaction(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !isValidDate(raw.occurredOn)) return null;
  return {
    id: raw.id,
    kind: raw.kind === 'income' ? 'income' : 'expense',
    amount,
    budgetKey: typeof raw.budgetKey === 'string' && raw.budgetKey ? raw.budgetKey : OTHER_KEY,
    merchant: typeof raw.merchant === 'string' ? raw.merchant : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    occurredOn: raw.occurredOn,
    source: raw.source === 'csv' ? 'csv' : 'manual',
    importHash: typeof raw.importHash === 'string' && raw.importHash ? raw.importHash : null,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    deletedAt: Number.isFinite(raw.deletedAt) ? raw.deletedAt : null,
  };
}

/** Noon UTC keeps the calendar date stable for every Israeli (and most other) time zones. */
const occurredAtOf = (date) => `${date}T12:00:00.000Z`;
const toIso = (ms) => new Date(ms).toISOString();

/** App transaction → public.transactions row (see supabase/migrations/0003_transactions_goals.sql). */
export function toRow(tx, userId) {
  return {
    id: tx.id,
    user_id: userId,
    kind: tx.kind,
    amount: tx.amount,
    budget_key: tx.budgetKey,
    merchant: tx.merchant.slice(0, TX_LIMITS.merchant),
    note: tx.note.slice(0, TX_LIMITS.note),
    occurred_at: occurredAtOf(tx.occurredOn),
    source: tx.source,
    import_hash: tx.importHash,
    client_updated_at: toIso(tx.updatedAt),
    deleted_at: tx.deletedAt ? toIso(tx.deletedAt) : null,
  };
}

/** public.transactions row → app transaction (`syncedAt` = server updated_at, for incremental pulls). */
export function fromRow(row) {
  const occurred = new Date(row.occurred_at);
  const tx = normalizeTransaction({
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount),
    budgetKey: row.budget_key,
    merchant: row.merchant ?? '',
    note: row.note ?? '',
    // Rows written by this app are noon UTC; for others, the UTC date is the best guess.
    occurredOn: Number.isNaN(occurred.getTime()) ? null : occurred.toISOString().slice(0, 10),
    source: row.source,
    importHash: row.import_hash,
    updatedAt: Date.parse(row.client_updated_at) || 0,
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
  });
  return tx && { ...tx, syncedAt: Date.parse(row.updated_at) || 0 };
}

/**
 * Merges remote rows into the local list: per id, the copy edited last (device time) wins, the same
 * rule as chooseJourney. Tombstones are kept so the deletion keeps winning over stale copies.
 */
export function mergeTransactions(local, remote) {
  const byId = new Map(local.map((tx) => [tx.id, tx]));
  for (const tx of remote) {
    const current = byId.get(tx.id);
    if (!current || tx.updatedAt > current.updatedAt) byId.set(tx.id, tx);
  }
  return [...byId.values()];
}

/** Live transactions, newest first (by date, then by last edit). */
export function visibleTransactions(list) {
  return list
    .filter((tx) => !tx.deletedAt)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.updatedAt - a.updatedAt);
}

/** Signed amount: income positive, expenses negative. */
export const signedAmount = (tx) => (tx.kind === 'income' ? tx.amount : -tx.amount);

const dateFormat = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatTxDate(occurredOn) {
  const [y, m, d] = occurredOn.split('-').map(Number);
  return dateFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

const wholeShekels = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const withAgorot = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Exact amount: ₪65 or ₪64.90 (agorot only when there are any). */
export function formatTxAmount(amount) {
  const value = Number(amount) || 0;
  return (Number.isInteger(value) ? wholeShekels : withAgorot).format(value);
}
