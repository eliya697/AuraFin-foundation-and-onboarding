import { LEAKS_BY_KEY } from './catalog.js';
import { DAY_MS } from './finance.js';

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function jitter(value, spread = 0.25) {
  const factor = 1 - spread + Math.random() * spread * 2;
  return Math.max(5, Math.round(value * factor));
}

function timestampDaysAgo(daysAgo, hour) {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  date.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  if (date.getTime() > Date.now()) date.setTime(Date.now() - 60 * 60 * 1000);
  return date.toISOString();
}

/**
 * Builds a realistic last-30-days ledger for a freshly onboarded user so the
 * dashboard and simulator are meaningful immediately. Every row carries the
 * 'sample' flag so it can be wiped in one action.
 */
export function buildSampleTransactions(profile) {
  const income = Number(profile.monthly_income) || 0;
  const scale = Math.min(Math.max(income / 15000, 0.6), 2.2);
  const rows = [];

  const add = (amount, category, merchant, daysAgo, hour, extra = {}) => {
    rows.push({
      amount,
      category,
      merchant,
      trigger_key: extra.trigger_key ?? null,
      occurred_at: timestampDaysAgo(daysAgo, hour),
      flags: ['sample', ...(extra.flags ?? [])],
    });
  };

  add(Math.round(income * 0.3), 'must', 'שכר דירה', 27, 9, { flags: ['recurring'] });
  add(Math.round(income * 0.045), 'must', 'חשמל, מים וארנונה', 20, 10, { flags: ['recurring'] });
  add(Math.round(income * 0.025), 'must', 'תחבורה ודלק', 15, 8);
  for (const daysAgo of [25, 18, 11, 4]) {
    add(jitter(income * 0.033, 0.15), 'must', pick(['שופרסל', 'רמי לוי', 'יוחננוף']), daysAgo, 18);
  }

  add(jitter(170 * scale), 'fun', 'סרט ופופקורן', 22, 20);
  add(jitter(320 * scale), 'fun', 'ארוחה עם חברים', 9, 21);

  const triggers = profile.impulse_triggers?.length ? profile.impulse_triggers : ['food_delivery'];
  for (const key of triggers) {
    const leak = LEAKS_BY_KEY[key];
    if (!leak) continue;
    const count = Math.max(1, Math.round(leak.perMonth * Math.min(scale, 1.4)));
    for (let i = 0; i < count; i += 1) {
      const hour = Math.random() < 0.35 ? 22 + Math.floor(Math.random() * 2) : 12 + Math.floor(Math.random() * 9);
      const flags = ['flagged_impulse'];
      if (hour >= 22) flags.push('late_night');
      add(jitter(leak.typicalAmount * scale), 'impulse', pick(leak.merchants), 1 + Math.floor(Math.random() * 28), hour, {
        trigger_key: key,
        flags,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
}
