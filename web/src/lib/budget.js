import { Building2, PartyPopper, ShieldAlert, Wallet } from 'lucide-react';
import { FIELDS, MAX_AMOUNT } from './catalog.js';

/** Sub-steps of the Mandatory Expense Gate, in order. */
export const GATE_STEPS = [
  {
    key: 'income',
    title: 'כמה נכנס כל חודש?',
    subtitle: 'הכנסה נטו — מה שבאמת מגיע לחשבון.',
    icon: Wallet,
    fields: ['income'],
  },
  {
    key: 'fixed',
    title: 'הוצאות קבועות',
    subtitle: 'מה שיוצא כל חודש בלי קשר להחלטות שלכם. אין הוצאה כזו? כתבו 0.',
    icon: Building2,
    fields: ['rent', 'electricity', 'water', 'municipal'],
  },
  {
    key: 'variable',
    title: 'הוצאות משתנות',
    subtitle: 'הערכה כנה לחודש רגיל. כאן מסתתרות רוב הדליפות.',
    icon: PartyPopper,
    fields: ['entertainment', 'dining', 'shopping'],
  },
  {
    key: 'unexpected',
    title: 'בלת"מים',
    subtitle: 'רכב שהתקלקל, רופא שיניים, מתנה לחתונה. כמה אתם משריינים בחודש להפתעות?',
    icon: ShieldAlert,
    fields: ['unexpected'],
  },
];

export const ALL_FIELDS = GATE_STEPS.flatMap((s) => s.fields);

/** Field key → path in the API payload (and in server validation errors). */
export const FIELD_PATHS = {
  income: 'income',
  rent: 'fixed.rent',
  electricity: 'fixed.electricity',
  water: 'fixed.water',
  municipal: 'fixed.municipal',
  entertainment: 'variable.entertainment',
  dining: 'variable.dining',
  shopping: 'variable.shopping',
  unexpected: 'unexpected',
};

const PATH_TO_FIELD = Object.fromEntries(Object.entries(FIELD_PATHS).map(([k, v]) => [v, k]));

export const EMPTY_BUDGET = Object.fromEntries(ALL_FIELDS.map((key) => [key, '']));

export function sanitizeAmount(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

/** Mirrors the FastAPI contract (api/app/schemas.py). Returns an error message or null. */
export function validateField(key, raw) {
  const { label, min } = FIELDS[key];
  if (raw === '' || raw === null || raw === undefined) {
    if (key === 'income') return 'חסרה ההכנסה החודשית נטו — בלעדיה אי אפשר לבנות תוכנית.';
    if (key === 'unexpected') return 'השדה הזה חובה — בלת"מים קורים לכולם.';
    return `חסר: ${label}. אין הוצאה כזו? כתבו 0.`;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return `${label}: יש להזין מספר.`;
  if (value > MAX_AMOUNT) return `הסכום ב${label} גבוה מדי. בדקו שלא נוספה ספרה.`;
  if (min > 0 && value <= 0) {
    return key === 'unexpected'
      ? 'חובה לשריין סכום לבלת"מים — גם ₪100 בחודש עדיף על כלום.'
      : `${label} חייב להיות גדול מ-0.`;
  }
  return null;
}

export function validateFields(values, keys = ALL_FIELDS) {
  const errors = {};
  for (const key of keys) {
    const message = validateField(key, values[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

export function isBudgetComplete(values) {
  return Object.keys(validateFields(values)).length === 0;
}

export function mapServerErrors(serverFields = []) {
  const errors = {};
  for (const { field, message } of serverFields) {
    const key = PATH_TO_FIELD[field];
    if (key) errors[key] = message;
  }
  return errors;
}

export function buildSnapshot(profile, values) {
  const n = (key) => Number(values[key]);
  return {
    profile: { life_stage: profile.lifeStage, primary_goal: profile.goal, track_id: profile.trackId },
    income: n('income'),
    fixed: { rent: n('rent'), electricity: n('electricity'), water: n('water'), municipal: n('municipal') },
    variable: { entertainment: n('entertainment'), dining: n('dining'), shopping: n('shopping') },
    unexpected: n('unexpected'),
  };
}

/** Client-side preview only; the dashboard uses the server's analysis. */
export function previewTotals(values) {
  const n = (key) => Number(values[key]) || 0;
  const expenses = ALL_FIELDS.filter((k) => k !== 'income').reduce((sum, key) => sum + n(key), 0);
  return { income: n('income'), expenses, remaining: n('income') - expenses };
}

const currency = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 1 });

export const formatCurrency = (value) => currency.format(Number(value) || 0);
export const formatPercent = (value) => percent.format(Number(value) || 0);
