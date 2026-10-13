import { motion } from 'framer-motion';
import { CircleCheck, TrendingDown, TriangleAlert } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import { formatCurrency, formatPercent } from '../../lib/budget.js';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function SavingsGoalMetric({ analysis }) {
  const saved = analysis.projected_savings;
  const goal = analysis.savings_goal;
  const progress = goal > 0 ? Math.min(Math.max(saved / goal, 0), 1) : 1;

  const status =
    saved < 0
      ? { icon: TriangleAlert, text: `חריגה של ${formatCurrency(-saved)} מההכנסה`, className: 'bg-danger/10 text-danger' }
      : analysis.on_track
        ? { icon: CircleCheck, text: `מעל היעד ב־${formatCurrency(analysis.savings_gap)}`, className: 'bg-mint/20 text-navy' }
        : { icon: TrendingDown, text: `חסרים ${formatCurrency(-analysis.savings_gap)} ליעד`, className: 'bg-amber-100 text-amber-800' };
  const StatusIcon = status.icon;

  return (
    <Card initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="h-full">
      <p className="text-sm font-bold text-navy-soft">סוף החודש · נחסך בפועל מול היעד</p>
      <div className="mt-5 flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id="goal-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00C4CC" />
                <stop offset="100%" stopColor="#00F299" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgb(0 33 71 / 0.07)" strokeWidth="12" />
            <motion.circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke="url(#goal-ring)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
              transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-2xl font-extrabold tabular-nums text-navy">{Math.round(progress * 100)}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className={`text-3xl font-extrabold tabular-nums sm:text-4xl ${saved < 0 ? 'text-danger' : 'text-navy'}`}>
            {formatCurrency(saved)}
          </p>
          <p className="mt-1 text-sm text-navy-soft">
            מתוך יעד של <span className="font-bold text-navy">{formatCurrency(goal)}</span>
          </p>
          <p className="text-xs text-navy-soft/80">שיעור חיסכון: {formatPercent(analysis.savings_rate)}</p>
        </div>
      </div>
      <span className={`mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${status.className}`}>
        <StatusIcon size={15} />
        {status.text}
      </span>
    </Card>
  );
}
