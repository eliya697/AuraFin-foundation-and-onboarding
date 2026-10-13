import { LEAKS_BY_KEY } from '../lib/catalog.js';
import { formatCurrency, formatHours, hoursOfLife, monthsToGoal, formatDuration } from '../lib/finance.js';

const COACH_MODE = import.meta.env.VITE_COACH_MODE === 'live' ? 'live' : 'mock';
const API_BASE = (import.meta.env.VITE_COACH_API_URL || '').replace(/\/$/, '');

export const coachMode = COACH_MODE;

export function buildCoachPayload(profile, summary) {
  const topTriggers = Object.entries(summary.byTrigger)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([key, amount]) => ({ key, label: LEAKS_BY_KEY[key]?.label ?? 'אחר', amount: Math.round(amount) }));

  return {
    profile: {
      full_name: profile.full_name,
      monthly_income: profile.monthly_income,
      weekly_work_hours: profile.weekly_work_hours,
      current_savings: profile.current_savings,
      currency: profile.currency,
      coach_persona: profile.coach_persona,
      dream_goal: profile.dream_goal,
      dream_goal_amount: profile.dream_goal_amount,
    },
    spending: {
      window_days: summary.windowDays,
      must_total: Math.round(summary.must),
      fun_total: Math.round(summary.fun),
      impulse_total: Math.round(summary.impulse),
      impulse_count: summary.impulseCount,
      top_triggers: topTriggers,
    },
  };
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join('\n')) };
}

async function streamLive({ payload, accessToken, signal, onDelta }) {
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE}/api/coach/insight`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    let detail = `שגיאת שרת (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Non-JSON error body: keep the status-based message.
    }
    throw new Error(detail);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let text = '';
  let meta = { model: null, inputTokens: null, outputTokens: null };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const parsed = parseSseBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
      if (!parsed) continue;

      if (parsed.event === 'delta') {
        text += parsed.data.text;
        onDelta(text);
      } else if (parsed.event === 'done') {
        meta = {
          model: parsed.data.model,
          inputTokens: parsed.data.input_tokens,
          outputTokens: parsed.data.output_tokens,
        };
      } else if (parsed.event === 'error') {
        throw new Error(parsed.data.message);
      }
    }
  }

  if (!text.trim()) throw new Error('המאמן לא החזיר תשובה. נסו שוב.');
  return { text, ...meta };
}

function buildMockInsight(payload) {
  const { profile, spending } = payload;
  const rate = profile.monthly_income / (profile.weekly_work_hours * (52 / 12));
  const hours = hoursOfLife(spending.impulse_total, rate);
  const top = spending.top_triggers[0];
  const surplus = profile.monthly_income - spending.must_total - spending.fun_total - spending.impulse_total;
  const withCut = monthsToGoal({
    startBalance: profile.current_savings,
    monthlyContribution: surplus + spending.impulse_total,
    goal: profile.dream_goal_amount,
  });
  const withoutCut = monthsToGoal({
    startBalance: profile.current_savings,
    monthlyContribution: surplus,
    goal: profile.dream_goal_amount,
  });
  const name = profile.full_name.split(' ')[0];
  const impulse = formatCurrency(spending.impulse_total, profile.currency);
  const topLabel = top ? top.label : 'קניות אימפולסיביות';

  if (profile.coach_persona === 'tough_love') {
    return `${name}, בוא נדבר תכלס. ${impulse} על אימפולסים החודש — זה ${formatHours(hours)} שעבדת בשביל דברים שכבר שכחת. ${topLabel} הוא החור הכי גדול שלך. ככה "${profile.dream_goal}" נשאר חלום: ${formatDuration(withoutCut)}. בלי האימפולסים — ${formatDuration(withCut)}. ב-48 השעות הקרובות: מחק את האפליקציה של ${topLabel} מהמסך הראשי. בלי משא ומתן.`;
  }
  if (profile.coach_persona === 'analytical') {
    const share = spending.impulse_total / Math.max(1, profile.monthly_income);
    return `${name}, הנתונים של ${spending.window_days} הימים האחרונים: ${spending.impulse_count} רכישות אימפולסיביות בסך ${impulse}, שהם ${Math.round(share * 100)}% מההכנסה ו-${formatHours(hours)} עבודה. ${topLabel} אחראי לנתח הגדול ביותר. במסלול הנוכחי, "${profile.dream_goal}" במרחק ${formatDuration(withoutCut)}; הסטה מלאה של סכום האימפולסים מקצרת אותו ל-${formatDuration(withCut)}. צעד ל-48 השעות הבאות: הגדר תקרה שבועית של ${formatCurrency(spending.impulse_total / 8, profile.currency)} ל${topLabel} ועקוב אחריה.`;
  }
  return `${name}, כל הכבוד שאתה מסתכל על המספרים — זה כבר צעד אמיץ. החודש הלכו ${impulse} על רגעים ספונטניים, בערך ${formatHours(hours)} מהזמן שלך. זה אנושי לגמרי, ובמיוחד ${topLabel}. אבל תחשוב: אותו סכום יכול לקרב את "${profile.dream_goal}" ל-${formatDuration(withCut)} במקום ${formatDuration(withoutCut)}. משימה קטנה ל-48 השעות הקרובות: לפני כל רכישה של ${topLabel}, חכה 10 דקות ושאל את עצמך אם זה שווה את הזמן.`;
}

async function streamMock({ payload, signal, onDelta }) {
  const full = buildMockInsight(payload);
  const words = full.split(/(\s+)/);
  let text = '';
  for (const word of words) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    text += word;
    onDelta(text);
    await new Promise((resolve) => setTimeout(resolve, word.trim() ? 32 : 0));
  }
  return { text, model: 'mock', inputTokens: null, outputTokens: null };
}

/**
 * Streams a coaching insight. `onDelta` receives the accumulated text after each chunk.
 */
export async function streamCoachInsight({ payload, accessToken, signal, onDelta }) {
  if (COACH_MODE === 'mock') return streamMock({ payload, signal, onDelta });
  return streamLive({ payload, accessToken, signal, onDelta });
}
