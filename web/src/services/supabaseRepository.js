import { supabase } from './supabaseClient.js';

const PROFILE_COLUMNS =
  'id, full_name, monthly_income, weekly_work_hours, hourly_rate, current_savings, currency, coach_persona, dream_goal, dream_goal_amount, impulse_triggers, onboarding_completed_at';
const TRANSACTION_COLUMNS = 'id, user_id, amount, category, merchant, trigger_key, occurred_at, flags';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function normalizeProfile(row) {
  if (!row) return null;
  return {
    ...row,
    monthly_income: Number(row.monthly_income),
    weekly_work_hours: Number(row.weekly_work_hours),
    hourly_rate: Number(row.hourly_rate),
    current_savings: Number(row.current_savings),
    dream_goal_amount: Number(row.dream_goal_amount),
  };
}

function normalizeTransaction(row) {
  return { ...row, amount: Number(row.amount) };
}

export const supabaseRepository = {
  mode: 'supabase',

  async ensureUser() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    if (sessionData.session?.user) return sessionData.session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
    return data.user.id;
  },

  async getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },

  async loadProfile(userId) {
    const row = unwrap(await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle());
    return normalizeProfile(row);
  },

  async saveProfile(userId, profile) {
    const payload = {
      id: userId,
      full_name: profile.full_name,
      monthly_income: profile.monthly_income,
      weekly_work_hours: profile.weekly_work_hours,
      current_savings: profile.current_savings,
      currency: profile.currency,
      coach_persona: profile.coach_persona,
      dream_goal: profile.dream_goal,
      dream_goal_amount: profile.dream_goal_amount,
      impulse_triggers: profile.impulse_triggers,
      onboarding_completed_at: profile.onboarding_completed_at,
    };
    const row = unwrap(await supabase.from('profiles').upsert(payload).select(PROFILE_COLUMNS).single());
    return normalizeProfile(row);
  },

  async listTransactions(userId, sinceDays = 90) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = unwrap(
      await supabase
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('user_id', userId)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false }),
    );
    return rows.map(normalizeTransaction);
  },

  async addTransactions(userId, transactions) {
    if (!transactions.length) return [];
    const payload = transactions.map((tx) => ({ ...tx, user_id: userId }));
    const rows = unwrap(await supabase.from('transactions').insert(payload).select(TRANSACTION_COLUMNS));
    return rows.map(normalizeTransaction);
  },

  async deleteSampleTransactions(userId) {
    unwrap(await supabase.from('transactions').delete().eq('user_id', userId).contains('flags', ['sample']));
  },

  async saveInsight(userId, insight) {
    unwrap(
      await supabase.from('ai_insights').insert({
        user_id: userId,
        persona: insight.persona,
        model: insight.model,
        content: insight.content,
        context: insight.context,
        input_tokens: insight.inputTokens ?? null,
        output_tokens: insight.outputTokens ?? null,
      }),
    );
  },

  async resetAll(userId) {
    // Cascades to transactions and ai_insights via FK.
    unwrap(await supabase.from('profiles').delete().eq('id', userId));
  },
};
