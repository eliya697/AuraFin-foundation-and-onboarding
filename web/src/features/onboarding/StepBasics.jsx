import { motion } from 'framer-motion';
import { GOAL_PRESETS } from '../../lib/catalog.js';
import { formatNumber } from '../../lib/finance.js';
import HourlyRateBadge from './HourlyRateBadge.jsx';

export default function StepBasics({ draft, update }) {
  const selectPreset = (preset) => {
    update('dream_goal', preset.label);
    update('dream_goal_key', preset.key);
    if (!draft.dream_goal_amount) update('dream_goal_amount', String(preset.suggestedAmount));
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="full_name" className="label">
          איך לקרוא לך?
        </label>
        <input
          id="full_name"
          className="field"
          placeholder="השם שלך"
          autoComplete="given-name"
          value={draft.full_name}
          onChange={(e) => update('full_name', e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monthly_income" className="label">
            הכנסה חודשית נטו (₪)
          </label>
          <input
            id="monthly_income"
            className="field text-lg font-semibold tabular-nums"
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="15,000"
            value={draft.monthly_income}
            onChange={(e) => update('monthly_income', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="current_savings" className="label">
            כמה כבר חסכת? (₪)
          </label>
          <input
            id="current_savings"
            className="field tabular-nums"
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="0"
            value={draft.current_savings}
            onChange={(e) => update('current_savings', e.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="weekly_work_hours" className="text-sm font-medium text-slate-300">
            שעות עבודה בשבוע
          </label>
          <span className="text-lg font-bold tabular-nums text-white">{draft.weekly_work_hours}</span>
        </div>
        <input
          id="weekly_work_hours"
          className="range"
          type="range"
          min="10"
          max="70"
          step="1"
          value={draft.weekly_work_hours}
          onChange={(e) => update('weekly_work_hours', Number(e.target.value))}
        />
      </div>

      <HourlyRateBadge monthlyIncome={draft.monthly_income} weeklyHours={draft.weekly_work_hours} />

      <div>
        <span className="label">המטרה הגדולה שלך</span>
        <div className="flex flex-wrap gap-2">
          {GOAL_PRESETS.map((preset) => {
            const active = draft.dream_goal_key === preset.key;
            const Icon = preset.icon;
            return (
              <motion.button
                key={preset.key}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => selectPreset(preset)}
                className={`relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-growth/60 text-white'
                    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="goal-pill"
                    className="absolute inset-0 rounded-full bg-growth/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon size={15} className="relative" />
                <span className="relative">{preset.label}</span>
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
          <input
            aria-label="תיאור המטרה"
            className="field"
            placeholder="או כתבו מטרה משלכם…"
            value={draft.dream_goal}
            onChange={(e) => {
              update('dream_goal', e.target.value);
              update('dream_goal_key', null);
            }}
          />
          <div className="relative">
            <input
              aria-label="סכום היעד"
              className="field pe-10 tabular-nums"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="סכום יעד"
              value={draft.dream_goal_amount}
              onChange={(e) => update('dream_goal_amount', e.target.value)}
            />
            <span className="pointer-events-none absolute inset-y-0 end-4 grid place-items-center text-slate-500">₪</span>
          </div>
        </div>
        {Number(draft.dream_goal_amount) > 0 && (
          <p className="mt-2 text-xs text-slate-500">יעד: ₪{formatNumber(draft.dream_goal_amount)}</p>
        )}
      </div>
    </div>
  );
}
