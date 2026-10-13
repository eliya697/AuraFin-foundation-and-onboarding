import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import GlassCard from '../../components/ui/GlassCard.jsx';
import AnimatedNumber from '../../components/ui/AnimatedNumber.jsx';
import {
  formatCurrency,
  formatDuration,
  formatHours,
  hoursOfLife,
  monthsToGoal,
  projectTrajectories,
} from '../../lib/finance.js';

const SERIES = {
  current: { label: 'המסלול הנוכחי', stroke: '#94a3b8', fill: 'url(#limbo-current)' },
  alternate: { label: 'המציאות החלופית', stroke: '#10b981', fill: 'url(#limbo-alternate)' },
};

const compact = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div dir="rtl" className="rounded-2xl border border-white/10 bg-ink/95 p-3 text-sm shadow-xl backdrop-blur">
      <p className="mb-1 text-xs text-slate-400">חודש {label}</p>
      {'alternate' in byKey && (
        <p className="text-growth">
          {SERIES.alternate.label}: <span className="font-semibold">{formatCurrency(byKey.alternate, currency)}</span>
        </p>
      )}
      {'current' in byKey && (
        <p className="text-slate-300">
          {SERIES.current.label}: <span className="font-semibold">{formatCurrency(byKey.current, currency)}</span>
        </p>
      )}
      {'alternate' in byKey && 'current' in byKey && (
        <p className="mt-1 border-t border-white/10 pt-1 text-xs text-amber-300">
          פער: {formatCurrency(byKey.alternate - byKey.current, currency)}
        </p>
      )}
    </div>
  );
}

function Slider({ id, label, value, display, min, max, step, onChange }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="text-slate-400">
          {label}
        </label>
        <span className="font-semibold tabular-nums text-white">{display}</span>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function LimboSimulator({ profile, summary }) {
  const [horizon, setHorizon] = useState(24);
  const [annualReturnPct, setAnnualReturnPct] = useState(4);
  const [cutPct, setCutPct] = useState(100);
  const [visible, setVisible] = useState({ current: true, alternate: true });

  const currency = profile.currency;
  const monthlySurplus = profile.monthly_income - summary.must - summary.fun - summary.impulse;
  const annualReturn = annualReturnPct / 100;
  const redirected = summary.impulse * (cutPct / 100);

  const data = useMemo(
    () =>
      projectTrajectories({
        startBalance: profile.current_savings,
        monthlySurplus,
        monthlyImpulse: summary.impulse,
        impulseCutRatio: cutPct / 100,
        months: horizon,
        annualReturn,
      }),
    [profile.current_savings, monthlySurplus, summary.impulse, cutPct, horizon, annualReturn],
  );

  const goalEta = useMemo(
    () => ({
      current: monthsToGoal({
        startBalance: profile.current_savings,
        monthlyContribution: monthlySurplus,
        annualReturn,
        goal: profile.dream_goal_amount,
      }),
      alternate: monthsToGoal({
        startBalance: profile.current_savings,
        monthlyContribution: monthlySurplus + redirected,
        annualReturn,
        goal: profile.dream_goal_amount,
      }),
    }),
    [profile.current_savings, profile.dream_goal_amount, monthlySurplus, redirected, annualReturn],
  );

  const last = data[data.length - 1];
  const gap = last.alternate - last.current;
  const peak = Math.max(...data.map((d) => Math.max(d.current, d.alternate)));
  const showGoalLine = profile.dream_goal_amount <= peak * 1.5;
  const monthsSaved =
    goalEta.current !== null && goalEta.alternate !== null ? goalEta.current - goalEta.alternate : null;

  const toggleSeries = (key) =>
    setVisible((v) => {
      const next = { ...v, [key]: !v[key] };
      return next.current || next.alternate ? next : v;
    });

  return (
    <GlassCard glow="bg-growth/15" className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-growth">
            <GitBranch size={18} />
            <span className="text-xs font-semibold uppercase tracking-widest">סימולטור הלימבו</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-white">שתי מציאויות, החלטה אחת</h2>
        </div>
        <div className="flex gap-2">
          {Object.entries(SERIES).map(([key, s]) => (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={visible[key]}
              onClick={() => toggleSeries(key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                visible[key] ? 'border-white/20 bg-white/10 text-white' : 'border-white/5 text-slate-500'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.stroke, opacity: visible[key] ? 1 : 0.3 }} />
              {s.label}
            </motion.button>
          ))}
        </div>
      </div>

      {monthlySurplus < 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-alert/30 bg-alert/10 p-3 text-sm text-amber-200">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          ההוצאות ב־30 הימים האחרונים גבוהות מההכנסה ב־{formatCurrency(-monthlySurplus, currency)}. המסלול הנוכחי שוחק את
          החיסכון.
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-growth/10 p-4">
          <p className="text-xs text-slate-400">הפער בעוד {horizon} חודשים</p>
          <p className="mt-1 text-2xl font-extrabold text-growth">
            <AnimatedNumber value={gap} format={(v) => formatCurrency(v, currency)} />
          </p>
          <p className="text-xs text-slate-400">= {formatHours(hoursOfLife(gap, profile.hourly_rate))} של חיים</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-slate-400">"{profile.dream_goal}" · עכשיו</p>
          <p className="mt-1 text-lg font-bold text-slate-200">{formatDuration(goalEta.current)}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-slate-400">"{profile.dream_goal}" · במציאות החלופית</p>
          <p className="mt-1 text-lg font-bold text-growth">{formatDuration(goalEta.alternate)}</p>
          {monthsSaved > 0 && <p className="text-xs text-emerald-300/80">מהר יותר ב־{formatDuration(monthsSaved)}</p>}
        </div>
      </div>

      <div dir="ltr" className="mt-5 h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="limbo-alternate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="limbo-current" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v) => `₪${compact.format(v)}`}
            />
            <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
            {showGoalLine && (
              <ReferenceLine
                y={profile.dream_goal_amount}
                stroke="#f59e0b"
                strokeDasharray="6 6"
                ifOverflow="extendDomain"
                label={{ value: 'יעד', fill: '#f59e0b', fontSize: 12, position: 'insideTopLeft' }}
              />
            )}
            {visible.current && (
              <Area
                type="monotone"
                dataKey="current"
                stroke={SERIES.current.stroke}
                strokeWidth={2}
                fill={SERIES.current.fill}
                animationDuration={700}
              />
            )}
            {visible.alternate && (
              <Area
                type="monotone"
                dataKey="alternate"
                stroke={SERIES.alternate.stroke}
                strokeWidth={2.5}
                fill={SERIES.alternate.fill}
                animationDuration={900}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Slider
          id="horizon"
          label="אופק"
          value={horizon}
          display={formatDuration(horizon)}
          min={6}
          max={60}
          step={6}
          onChange={setHorizon}
        />
        <Slider
          id="return"
          label="תשואה שנתית"
          value={annualReturnPct}
          display={`${annualReturnPct}%`}
          min={0}
          max={10}
          step={0.5}
          onChange={setAnnualReturnPct}
        />
        <Slider
          id="cut"
          label="קיצוץ אימפולסים"
          value={cutPct}
          display={`${cutPct}%`}
          min={10}
          max={100}
          step={10}
          onChange={setCutPct}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        המציאות החלופית מניחה שאת {cutPct}% מסכום האימפולסים החודשי ({formatCurrency(redirected, currency)}) מעבירים לחיסכון.
        התשואה היא הנחת עבודה לצורכי המחשה בלבד ואינה ייעוץ השקעות.
      </p>
    </GlassCard>
  );
}
