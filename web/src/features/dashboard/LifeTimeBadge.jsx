import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hourglass, Wallet } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard.jsx';
import AnimatedNumber from '../../components/ui/AnimatedNumber.jsx';
import { formatCurrency, formatNumber, hoursOfLife, workDaysFromHours } from '../../lib/finance.js';

const MODES = [
  { key: 'time', label: 'זמן חיים', icon: Hourglass },
  { key: 'money', label: 'שקלים', icon: Wallet },
];

export default function LifeTimeBadge({ impulseTotal, impulseCount, hourlyRate, weeklyHours, currency }) {
  const [mode, setMode] = useState('time');
  const hours = hoursOfLife(impulseTotal, hourlyRate);
  const days = workDaysFromHours(hours, weeklyHours);

  return (
    <GlassCard glow="bg-alert/25" className="h-full">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-400">אימפולסים · 30 ימים</p>
        <div role="tablist" aria-label="יחידת תצוגה" className="relative flex rounded-full border border-white/10 bg-white/5 p-1">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === key ? 'text-ink' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === key && (
                <motion.span
                  layoutId="lifetime-toggle"
                  className="absolute inset-0 rounded-full bg-alert"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon size={13} className="relative" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 [perspective:800px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ rotateX: -80, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'center' }}
          >
            {mode === 'time' ? (
              <>
                <p className="text-5xl font-extrabold tracking-tight text-alert sm:text-6xl">
                  <AnimatedNumber value={hours} format={(v) => formatNumber(Math.round(v * 10) / 10)} />
                  <span className="ms-2 text-xl font-semibold text-amber-200/80">שעות</span>
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  של חיים שהוחלפו בדברים רגעיים — כ־
                  <span className="font-semibold text-white">{formatNumber(Math.round(days * 10) / 10)} ימי עבודה</span> מלאים.
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
                  <AnimatedNumber value={impulseTotal} format={(v) => formatCurrency(v, currency)} />
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  ב־<span className="font-semibold text-white">{impulseCount}</span> רכישות אימפולסיביות. נראה פחות כואב בשקלים,
                  נכון?
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
