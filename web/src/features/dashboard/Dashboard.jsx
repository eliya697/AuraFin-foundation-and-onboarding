import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Cloud, HardDrive, Clock, Target, Zap, RotateCcw, Sparkles } from 'lucide-react';
import MetricCard from '../../components/ui/MetricCard.jsx';
import AnimatedNumber from '../../components/ui/AnimatedNumber.jsx';
import LifeTimeBadge from './LifeTimeBadge.jsx';
import LimboSimulator from './LimboSimulator.jsx';
import AIInsightBanner from './AIInsightBanner.jsx';
import QuickAddTransaction from './QuickAddTransaction.jsx';
import TransactionsList from './TransactionsList.jsx';
import { PERSONAS_BY_KEY } from '../../lib/catalog.js';
import { formatCurrency, summarizeSpending } from '../../lib/finance.js';
import { useAppState } from '../../state/AppStateContext.jsx';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'לילה טוב';
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  if (hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default function Dashboard() {
  const { profile, transactions, mode, resetProfile } = useAppState();
  const summary = useMemo(() => summarizeSpending(transactions), [transactions]);
  const persona = PERSONAS_BY_KEY[profile.coach_persona];
  const goalProgress = Math.min(1, profile.current_savings / profile.dream_goal_amount);
  const impulseShare = summary.total > 0 ? summary.impulse / summary.total : 0;

  const onReset = () => {
    if (window.confirm('להתחיל מחדש? הפרופיל וכל ההוצאות יימחקו.')) resetProfile();
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:pt-8">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-growth/15 text-growth">
            <Sparkles size={20} />
          </span>
          <div>
            <p className="text-sm text-slate-400">{greeting()},</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">{profile.full_name.split(' ')[0]}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 ${persona.text}`}>
            <persona.icon size={13} /> {persona.title}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-400"
            title={mode === 'supabase' ? 'מסונכרן ל-Supabase' : 'נשמר מקומית בדפדפן'}
          >
            {mode === 'supabase' ? <Cloud size={13} /> : <HardDrive size={13} />}
            {mode === 'supabase' ? 'ענן' : 'מקומי'}
          </span>
          <motion.button
            type="button"
            whileTap={{ rotate: -180 }}
            onClick={onReset}
            aria-label="התחלה מחדש"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-white"
          >
            <RotateCcw size={14} />
          </motion.button>
        </div>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:row-span-1">
          <LifeTimeBadge
            impulseTotal={summary.impulse}
            impulseCount={summary.impulseCount}
            hourlyRate={profile.hourly_rate}
            weeklyHours={profile.weekly_work_hours}
            currency={profile.currency}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          <MetricCard icon={Clock} label="שווי שעת חיים" tone="growth" footnote={`${profile.weekly_work_hours} שעות בשבוע`}>
            <AnimatedNumber value={profile.hourly_rate} format={(v) => formatCurrency(v, profile.currency, 2)} />
          </MetricCard>
          <MetricCard
            icon={Zap}
            label="נתח האימפולסים"
            tone="alert"
            delay={0.05}
            footnote={`${formatCurrency(summary.impulse, profile.currency)} מתוך ${formatCurrency(summary.total, profile.currency)}`}
          >
            <AnimatedNumber value={impulseShare * 100} format={(v) => `${Math.round(v)}%`} />
          </MetricCard>
          <div className="col-span-2 lg:col-span-1">
            <MetricCard icon={Target} label={profile.dream_goal} delay={0.1} footnote={`יעד: ${formatCurrency(profile.dream_goal_amount, profile.currency)}`}>
              <AnimatedNumber value={goalProgress * 100} format={(v) => `${v.toFixed(1)}%`} />
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-l from-growth to-emerald-300"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(goalProgress * 100, 1.5)}%` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.3 }}
                />
              </div>
            </MetricCard>
          </div>
        </div>

        <div className="lg:col-span-3">
          <AIInsightBanner profile={profile} summary={summary} />
        </div>

        <div className="lg:col-span-2">
          <LimboSimulator profile={profile} summary={summary} />
        </div>

        <div>
          <QuickAddTransaction profile={profile} />
        </div>

        <div className="lg:col-span-3">
          <TransactionsList profile={profile} transactions={transactions} />
        </div>
      </div>
    </div>
  );
}
