import { activeScalarFields } from './budget.js';
import { monthOf, plannedFor } from './analytics.js';
import { stableUuid } from './ids.js';
import { OTHER_KEY, isValidDate, resolveLineKey, todayISO } from './transactions.js';

/**
 * Daily engagement: check-ins, "no-spend day" streaks, micro-tasks, XP and the daily safe-to-spend
 * allowance. Pure functions (see tests/habits.test.js); synced like goals (entity 'daily_logs',
 * table public.daily_logs, migration 0005).
 *
 * A day log: { id, date: 'YYYY-MM-DD', noSpend: true | false | null (not answered),
 *              tasks: { review, allowance, cash } (booleans), updatedAt, deletedAt }
 * The id is derived from user + date, so two devices checking in on the same day edit one row.
 */

export const TASKS = Object.freeze([
  { id: 'review', label: 'לעבור על ההוצאות של היום' },
  { id: 'allowance', label: 'לבדוק כמה נשאר להוציא היום' },
  { id: 'cash', label: 'לרשום הוצאה במזומן (אם הייתה)' },
]);
const TASK_IDS = TASKS.map((task) => task.id);

export const XP = Object.freeze({ noSpend: 25, checkIn: 5, task: 10, allTasks: 15, perLevel: 200 });

export const BADGES = Object.freeze([
  { id: 'streak-1', days: 1, emoji: '🌱', label: 'יום ראשון בלי הוצאות' },
  { id: 'streak-3', days: 3, emoji: '🔥', label: '3 ימים ברצף' },
  { id: 'streak-7', days: 7, emoji: '⭐', label: 'שבוע נקי' },
  { id: 'streak-14', days: 14, emoji: '💎', label: 'שבועיים ברצף' },
  { id: 'streak-30', days: 30, emoji: '🏆', label: 'חודש שלם' },
]);

/** Lines whose spending is committed (bills, rent, children, custom fixed items, the reserve). */
const FIXED_KEYS = new Set(['rent', 'electricity', 'water', 'municipal', 'children', 'unexpected']);
const isFixedKey = (key) => FIXED_KEYS.has(key) || key.startsWith('custom:');

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const pad = (n) => String(n).padStart(2, '0');

export function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

const daysInMonth = (date) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const dailyLogId = (userId, date) => stableUuid(`aurafin-daily-log-v1|${userId}|${date}`);

export function emptyTasks() {
  return Object.fromEntries(TASK_IDS.map((id) => [id, false]));
}

export function normalizeDailyLog(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || !isValidDate(raw.date)) return null;
  const tasks = emptyTasks();
  if (isObject(raw.tasks)) for (const id of TASK_IDS) tasks[id] = raw.tasks[id] === true;
  return {
    id: raw.id,
    date: raw.date,
    noSpend: raw.noSpend === true || raw.noSpend === false ? raw.noSpend : null,
    tasks,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    deletedAt: Number.isFinite(raw.deletedAt) ? raw.deletedAt : null,
  };
}

/** A copy of the day's log (or a new one) with `patch` applied: { noSpend?, tasks?: { id: bool } }. */
export async function updatedLog(existing, { userId, date, patch, now = Date.now() }) {
  const base = existing ?? { id: await dailyLogId(userId, date), date, noSpend: null, tasks: emptyTasks(), deletedAt: null };
  return {
    ...base,
    noSpend: patch.noSpend === undefined ? base.noSpend : patch.noSpend,
    tasks: { ...base.tasks, ...(patch.tasks ?? {}) },
    updatedAt: now,
    deletedAt: null,
  };
}

/** One log per date (the newest edit wins if two ids ever share a date), keyed by date. */
export function logsByDate(logs) {
  const map = new Map();
  for (const log of logs) {
    if (log.deletedAt) continue;
    const current = map.get(log.date);
    if (!current || log.updatedAt > current.updatedAt) map.set(log.date, log);
  }
  return map;
}

/** Dates with at least one live expense (a logged "no-spend" day that has one doesn't count). */
export function expenseDates(transactions) {
  return new Set(transactions.filter((tx) => !tx.deletedAt && tx.kind === 'expense').map((tx) => tx.occurredOn));
}

const isNoSpendDay = (log, spentOn) => Boolean(log?.noSpend === true && !spentOn.has(log.date));

/**
 * { current, best }: consecutive no-spend days. Today not answered yet keeps yesterday's streak
 * alive (it isn't lost before the day is over); today answered "spent" ends it.
 */
export function noSpendStreak(logs, transactions, today = todayISO()) {
  const byDate = logsByDate(logs);
  const spentOn = expenseDates(transactions);
  const todayLog = byDate.get(today);
  let current = 0;
  if (!(todayLog?.noSpend === false || spentOn.has(today))) {
    let day = isNoSpendDay(todayLog, spentOn) ? today : shiftDate(today, -1);
    while (isNoSpendDay(byDate.get(day), spentOn)) {
      current += 1;
      day = shiftDate(day, -1);
    }
  }
  let best = 0;
  let run = 0;
  let previous = null;
  for (const date of [...byDate.keys()].sort()) {
    if (isNoSpendDay(byDate.get(date), spentOn)) {
      run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
      previous = date;
      best = Math.max(best, run);
    } else {
      run = 0;
      previous = null;
    }
  }
  return { current, best: Math.max(best, current) };
}

/** XP for one day: answering, a no-spend day, each micro-task and a bonus for finishing them all. */
export function dayXp(log, spentOn = new Set()) {
  if (!log || log.deletedAt) return 0;
  let xp = log.noSpend === null ? 0 : XP.checkIn;
  if (isNoSpendDay(log, spentOn)) xp += XP.noSpend;
  const done = TASK_IDS.filter((id) => log.tasks[id]).length;
  xp += done * XP.task;
  if (done === TASK_IDS.length) xp += XP.allTasks;
  return xp;
}

/** { xp, level, intoLevel, toNext, progress } over all logs. */
export function experience(logs, transactions) {
  const spentOn = expenseDates(transactions);
  const xp = [...logsByDate(logs).values()].reduce((sum, log) => sum + dayXp(log, spentOn), 0);
  const level = Math.floor(xp / XP.perLevel) + 1;
  const intoLevel = xp % XP.perLevel;
  return { xp, level, intoLevel, toNext: XP.perLevel - intoLevel, progress: intoLevel / XP.perLevel };
}

export function earnedBadges(bestStreak) {
  return BADGES.filter((badge) => bestStreak >= badge.days);
}

/**
 * Daily safe-to-spend. The month's flexible money is income − committed lines (fixed bills, rent,
 * children, custom items, the unexpected reserve) − the monthly savings goal. What is left of it after
 * this month's flexible spending before today, spread over the days left (today included), is today's
 * allowance. Committed lines that ran over their plan eat into the flexible money too.
 *
 * Returns { monthlyFlexible, dailyAverage, allowance, spentToday, remainingToday, overBy, daysLeft,
 *           status: 'ok' | 'tight' | 'over' | 'empty' }
 */
export function dailyAllowance({ budget, profile, lines, transactions, savingsGoal = 0, today = todayISO() }) {
  const month = monthOf(today);
  const keys = activeScalarFields(profile).filter((key) => key !== 'income');
  const committedKeys = [...keys.filter(isFixedKey), ...(budget?.custom ?? []).map((item) => `custom:${item.id}`)];
  const committedPlan = committedKeys.reduce((sum, key) => sum + plannedFor(key, budget), 0);
  const income = Number(budget?.income) || 0;
  const monthlyFlexible = Math.max(0, income - committedPlan - (Number(savingsGoal) || 0));

  let flexibleBefore = 0;
  let spentToday = 0;
  const committedActual = new Map();
  for (const tx of transactions) {
    if (tx.deletedAt || tx.kind !== 'expense' || monthOf(tx.occurredOn) !== month || tx.occurredOn > today) continue;
    const key = resolveLineKey(tx, lines);
    if (key !== OTHER_KEY && isFixedKey(key)) {
      committedActual.set(key, (committedActual.get(key) ?? 0) + tx.amount);
      continue;
    }
    if (tx.occurredOn === today) spentToday += tx.amount;
    else flexibleBefore += tx.amount;
  }
  const committedOverrun = [...committedActual].reduce((sum, [key, actual]) => sum + Math.max(0, actual - plannedFor(key, budget)), 0);

  const total = daysInMonth(today);
  const daysLeft = total - Number(today.slice(8, 10)) + 1;
  const left = monthlyFlexible - flexibleBefore - committedOverrun;
  const allowance = Math.max(0, left / daysLeft);
  const dailyAverage = monthlyFlexible / total;
  const remainingToday = allowance - spentToday;
  const round = (n) => Math.round(n);

  let status = 'ok';
  if (monthlyFlexible <= 0 || left <= 0) status = 'empty';
  else if (remainingToday < 0) status = 'over';
  else if (allowance < dailyAverage * 0.6) status = 'tight';

  return {
    monthlyFlexible: round(monthlyFlexible),
    dailyAverage: round(dailyAverage),
    allowance: round(allowance),
    spentToday: round(spentToday),
    remainingToday: round(remainingToday),
    overBy: round(Math.max(0, spentToday - allowance)),
    overAverageBy: round(Math.max(0, spentToday - dailyAverage)),
    daysLeft,
    status,
  };
}

/** Short encouraging / warning badges for the widget header. */
export function feedbackBadges({ streak, allowance }) {
  const badges = [];
  if (streak.current >= 2) badges.push({ tone: 'good', text: `🔥 ${streak.current} ימים ברצף בלי הוצאות!` });
  if (allowance.status === 'over') badges.push({ tone: 'warn', text: `⚠️ חרגתם היום ב-₪${allowance.overBy.toLocaleString('he-IL')}` });
  else if (allowance.overAverageBy > 0) badges.push({ tone: 'warn', text: `⚠️ ₪${allowance.overAverageBy.toLocaleString('he-IL')} מעל הממוצע היומי` });
  else if (allowance.status === 'tight') badges.push({ tone: 'warn', text: '🐢 החודש צפוף — כדאי להאט' });
  else if (allowance.status === 'ok' && allowance.spentToday === 0) badges.push({ tone: 'good', text: '✅ עוד לא הוצאתם היום' });
  return badges;
}

// ─── Row mapping (public.daily_logs) ─────────────────────────

const toIso = (ms) => new Date(ms).toISOString();

export function dailyLogToRow(log, userId) {
  return {
    id: log.id,
    user_id: userId,
    log_date: log.date,
    no_spend: log.noSpend,
    tasks: Object.fromEntries(TASK_IDS.map((id) => [id, Boolean(log.tasks[id])])),
    client_updated_at: toIso(log.updatedAt),
    deleted_at: log.deletedAt ? toIso(log.deletedAt) : null,
  };
}

export function dailyLogFromRow(row) {
  const log = normalizeDailyLog({
    id: row.id,
    date: row.log_date,
    noSpend: row.no_spend,
    tasks: row.tasks,
    updatedAt: Date.parse(row.client_updated_at) || 0,
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
  });
  return log && { ...log, syncedAt: Date.parse(row.updated_at) || 0 };
}
