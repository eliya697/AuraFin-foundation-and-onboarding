import { Baby, Building2, ListPlus, PartyPopper, ShieldAlert, Wallet } from 'lucide-react';
import { CHILDREN, CUSTOM_LIMITS, FIELDS, MAX_AMOUNT } from './catalog.js';

const STEP_DEFINITIONS = [
  {
    key: 'income',
    tab: 'הכנסה',
    title: 'כמה נכנס כל חודש?',
    subtitle: 'הכנסה נטו — מה שבאמת מגיע לחשבון.',
    icon: Wallet,
    fields: ['income'],
  },
  {
    key: 'fixed',
    tab: 'קבועות',
    title: 'הוצאות קבועות',
    subtitle: 'מה שיוצא כל חודש בלי קשר להחלטות שלכם. אין הוצאה כזו? כתבו 0.',
    icon: Building2,
    fields: ['rent', 'electricity', 'water', 'municipal'],
  },
  {
    key: 'children',
    tab: 'ילדים',
    title: 'הוצאות על הילדים',
    subtitle: 'גן, צהרון, חוגים, ביגוד, טיטולים ובריאות — הכל ביחד, הערכה לחודש רגיל.',
    icon: Baby,
    fields: ['children'],
    when: (profile) => Boolean(profile?.hasChildren),
  },
  {
    key: 'variable',
    tab: 'משתנות',
    title: 'הוצאות משתנות',
    subtitle: 'הערכה כנה לחודש רגיל. כאן מסתתרות רוב הדליפות.',
    icon: PartyPopper,
    fields: ['entertainment', 'dining', 'shopping'],
  },
  {
    key: 'custom',
    tab: 'אישיות',
    title: 'הוצאות אישיות',
    subtitle: 'משהו שלא הופיע? חדר כושר, ביטוח רכב, תרומה קבועה. אין? אפשר להמשיך.',
    icon: ListPlus,
    fields: [],
    isCustomList: true,
  },
  {
    key: 'unexpected',
    tab: 'בלת"מים',
    title: 'בלת"מים',
    subtitle: 'רכב שהתקלקל, רופא שיניים, מתנה לחתונה. כמה אתם משריינים בחודש להפתעות?',
    icon: ShieldAlert,
    fields: ['unexpected'],
  },
];

/** Gate sub-steps for this profile, in order (the children step appears only for parents). */
export function getGateSteps(profile) {
  return STEP_DEFINITIONS.filter((step) => !step.when || step.when(profile));
}

export const SCALAR_FIELDS = STEP_DEFINITIONS.flatMap((s) => s.fields);

export function activeScalarFields(profile) {
  return getGateSteps(profile).flatMap((s) => s.fields);
}

/** Field key → path in the API payload (and in server validation errors). */
export const FIELD_PATHS = {
  income: 'income',
  rent: 'fixed.rent',
  electricity: 'fixed.electricity',
  water: 'fixed.water',
  municipal: 'fixed.municipal',
  children: 'children_expenses',
  entertainment: 'variable.entertainment',
  dining: 'variable.dining',
  shopping: 'variable.shopping',
  unexpected: 'unexpected',
};

const PATH_TO_FIELD = Object.fromEntries(Object.entries(FIELD_PATHS).map(([k, v]) => [v, k]));

export const EMPTY_BUDGET = { ...Object.fromEntries(SCALAR_FIELDS.map((key) => [key, ''])), custom: [] };

export function newCustomExpense() {
  return { id: crypto.randomUUID(), title: '', amount: '' };
}

/** Error-map key for a custom expense row field. */
export const customKey = (id, part) => `custom.${id}.${part}`;

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
    if (key === 'children') return 'כמה יוצא על הילדים בחודש? גם הערכה גסה עוזרת.';
    return `חסר: ${label}. אין הוצאה כזו? כתבו 0.`;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return `${label}: יש להזין מספר.`;
  if (value > MAX_AMOUNT) return `הסכום ב${label} גבוה מדי. בדקו שלא נוספה ספרה.`;
  if (min > 0 && value <= 0) {
    if (key === 'unexpected') return 'חובה לשריין סכום לבלת"מים — גם ₪100 בחודש עדיף על כלום.';
    if (key === 'children') return 'יש לכם ילדים — כמה יוצא עליהם בחודש? גם הערכה גסה עוזרת.';
    return `${label} חייב להיות גדול מ-0.`;
  }
  return null;
}

export function validateCustomExpense(item) {
  const errors = {};
  const title = item.title.trim();
  if (!title) errors.title = 'תנו להוצאה שם, למשל "חדר כושר".';
  else if (title.length > CUSTOM_LIMITS.maxTitleLength) errors.title = `השם ארוך מדי (עד ${CUSTOM_LIMITS.maxTitleLength} תווים).`;

  if (item.amount === '' || item.amount === null || item.amount === undefined) errors.amount = 'כמה זה עולה בחודש?';
  else if (!Number.isFinite(Number(item.amount))) errors.amount = 'יש להזין מספר.';
  else if (Number(item.amount) <= 0) errors.amount = 'הסכום חייב להיות גדול מ-0. לא רלוונטי? מחקו את השורה.';
  else if (Number(item.amount) > MAX_AMOUNT) errors.amount = 'הסכום גבוה מדי. בדקו שלא נוספה ספרה.';
  return errors;
}

function customErrors(values) {
  const errors = {};
  for (const item of values.custom) {
    for (const [part, message] of Object.entries(validateCustomExpense(item))) errors[customKey(item.id, part)] = message;
  }
  if (values.custom.length > CUSTOM_LIMITS.maxItems) errors.custom = `אפשר להוסיף עד ${CUSTOM_LIMITS.maxItems} הוצאות אישיות.`;
  return errors;
}

/** Flat error map for a set of steps: scalar field keys plus `custom.<id>.<part>` keys. */
export function validateSteps(steps, values) {
  const errors = {};
  for (const step of steps) {
    for (const key of step.fields) {
      const message = validateField(key, values[key]);
      if (message) errors[key] = message;
    }
    if (step.isCustomList) Object.assign(errors, customErrors(values));
  }
  return errors;
}

export function validateBudget(values, profile) {
  return validateSteps(getGateSteps(profile), values);
}

export function isBudgetComplete(values, profile) {
  return Object.keys(validateBudget(values, profile)).length === 0;
}

/** Keys that belong to a step, for jumping to the first step with an error. */
export function stepOwnsError(step, errorKey) {
  return step.fields.includes(errorKey) || (step.isCustomList && errorKey.startsWith('custom'));
}

/** Progress for the gate status bar: required scalar fields plus each custom row. */
export function gateProgress(values, profile) {
  const errors = validateBudget(values, profile);
  const scalars = activeScalarFields(profile);
  const doneScalars = scalars.filter((key) => !errors[key]).length;
  const doneRows = values.custom.filter((item) => Object.keys(validateCustomExpense(item)).length === 0).length;
  return { done: doneScalars + doneRows, total: scalars.length + values.custom.length };
}

export function mapServerErrors(serverFields = [], values) {
  const errors = {};
  for (const { field, message } of serverFields) {
    const custom = field.match(/^custom_expenses\.(\d+)\.(title|amount)$/);
    if (custom) {
      const item = values.custom[Number(custom[1])];
      if (item) errors[customKey(item.id, custom[2])] = message;
    } else if (field === 'custom_expenses') {
      errors.custom = message;
    } else if (PATH_TO_FIELD[field]) {
      errors[PATH_TO_FIELD[field]] = message;
    }
  }
  return errors;
}

export function buildSnapshot(profile, values) {
  const n = (key) => Number(values[key]);
  const hasChildren = Boolean(profile.hasChildren);
  return {
    profile: {
      life_stage: profile.lifeStage,
      primary_goal: profile.goal,
      track_id: profile.trackId,
      has_children: hasChildren,
      children_count: hasChildren ? profile.childrenCount : 0,
    },
    income: n('income'),
    fixed: { rent: n('rent'), electricity: n('electricity'), water: n('water'), municipal: n('municipal') },
    variable: { entertainment: n('entertainment'), dining: n('dining'), shopping: n('shopping') },
    unexpected: n('unexpected'),
    children_expenses: hasChildren ? n('children') : 0,
    custom_expenses: values.custom.map((item) => ({ title: item.title.trim(), amount: Number(item.amount) })),
  };
}

/** Client-side preview for the gate summary; the dashboard uses the analysis. */
export function previewTotals(values, profile) {
  const n = (v) => Number(v) || 0;
  const scalars = activeScalarFields(profile).filter((k) => k !== 'income');
  const expenses =
    scalars.reduce((sum, key) => sum + n(values[key]), 0) + values.custom.reduce((sum, item) => sum + n(item.amount), 0);
  return { income: n(values.income), expenses, remaining: n(values.income) - expenses };
}

export const MAX_CHILDREN = CHILDREN.maxCount;

const currency = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 1 });

export const formatCurrency = (value) => currency.format(Number(value) || 0);
export const formatPercent = (value) => percent.format(Number(value) || 0);
