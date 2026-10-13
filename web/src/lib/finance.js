export const WEEKS_PER_MONTH = 52 / 12;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function monthlyWorkHours(weeklyHours) {
  return Math.max(0, Number(weeklyHours) || 0) * WEEKS_PER_MONTH;
}

export function calcHourlyRate(monthlyIncome, weeklyHours) {
  const hours = monthlyWorkHours(weeklyHours);
  const income = Number(monthlyIncome) || 0;
  if (hours <= 0 || income <= 0) return 0;
  return Math.round((income / hours) * 100) / 100;
}

export function hoursOfLife(amount, hourlyRate) {
  return hourlyRate > 0 ? (Number(amount) || 0) / hourlyRate : 0;
}

const currencyFormatters = new Map();

export function formatCurrency(value, currency = 'ILS', fractionDigits = 0) {
  const key = `${currency}:${fractionDigits}`;
  if (!currencyFormatters.has(key)) {
    currencyFormatters.set(
      key,
      new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }),
    );
  }
  return currencyFormatters.get(key).format(Number(value) || 0);
}

const numberFormatter = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });

export function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

export function formatHours(hours) {
  const h = Math.max(0, Number(hours) || 0);
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return minutes === 1 ? 'דקה אחת' : `${minutes} דקות`;
  }
  if (h < 10) return `${numberFormatter.format(Math.round(h * 10) / 10)} שעות`;
  return `${numberFormatter.format(Math.round(h))} שעות`;
}

export function workDaysFromHours(hours, weeklyHours) {
  const hoursPerDay = (Number(weeklyHours) || 0) / 5;
  return hoursPerDay > 0 ? hours / hoursPerDay : 0;
}

/**
 * Totals per category within the trailing window (default: last 30 days).
 */
export function summarizeSpending(transactions, windowDays = 30, now = Date.now()) {
  const since = now - windowDays * DAY_MS;
  const summary = {
    must: 0,
    fun: 0,
    impulse: 0,
    impulseCount: 0,
    total: 0,
    byTrigger: {},
    windowDays,
  };

  for (const tx of transactions) {
    const ts = new Date(tx.occurred_at).getTime();
    if (Number.isNaN(ts) || ts < since || ts > now) continue;
    const amount = Number(tx.amount) || 0;
    summary[tx.category] += amount;
    summary.total += amount;
    if (tx.category === 'impulse') {
      summary.impulseCount += 1;
      const key = tx.trigger_key || 'other';
      summary.byTrigger[key] = (summary.byTrigger[key] || 0) + amount;
    }
  }

  return summary;
}

/**
 * Month-by-month balance for the current trajectory vs. an alternate reality in
 * which a share of impulse spending is redirected into savings.
 */
export function projectTrajectories({
  startBalance,
  monthlySurplus,
  monthlyImpulse,
  impulseCutRatio = 1,
  months,
  annualReturn = 0,
}) {
  const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const redirected = monthlyImpulse * impulseCutRatio;
  let current = startBalance;
  let alternate = startBalance;
  const points = [{ month: 0, current: Math.round(current), alternate: Math.round(alternate) }];

  for (let m = 1; m <= months; m += 1) {
    current = current * (1 + monthlyRate) + monthlySurplus;
    alternate = alternate * (1 + monthlyRate) + monthlySurplus + redirected;
    points.push({ month: m, current: Math.round(current), alternate: Math.round(alternate) });
  }

  return points;
}

/**
 * Months until `balance` reaches `goal`, simulated up to `maxMonths`. Returns null when unreachable.
 */
export function monthsToGoal({ startBalance, monthlyContribution, annualReturn = 0, goal, maxMonths = 600 }) {
  if (startBalance >= goal) return 0;
  const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let balance = startBalance;
  for (let m = 1; m <= maxMonths; m += 1) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= goal) return m;
  }
  return null;
}

export function formatDuration(months) {
  if (months === null || months === undefined) return 'לא בטווח הנראה לעין';
  if (months === 0) return 'כבר הגעת!';
  if (months < 12) return months === 1 ? 'חודש אחד' : `${months} חודשים`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsLabel = years === 1 ? 'שנה' : years === 2 ? 'שנתיים' : `${years} שנים`;
  if (rest === 0) return yearsLabel;
  return `${yearsLabel} ו-${rest === 1 ? 'חודש' : `${rest} חודשים`}`;
}
