import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import AnimatedNumber from '../../components/ui/AnimatedNumber.jsx';
import { calcHourlyRate, formatCurrency, formatHours } from '../../lib/finance.js';

export default function HourlyRateBadge({ monthlyIncome, weeklyHours }) {
  const rate = calcHourlyRate(monthlyIncome, weeklyHours);
  const hasRate = rate > 0;

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-3xl border border-growth/25 bg-gradient-to-l from-growth/15 via-growth/5 to-transparent p-5"
    >
      <motion.div
        className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-growth/30 blur-3xl"
        animate={{ opacity: hasRate ? [0.4, 0.8, 0.4] : 0.15 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-growth/15 text-growth">
          <Clock size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-400">שעת חיים שלך שווה</p>
          <p className="text-3xl font-extrabold tracking-tight text-white">
            <AnimatedNumber value={rate} format={(v) => formatCurrency(v, 'ILS', 2)} />
            <span className="ms-1 text-base font-medium text-slate-400">לשעה</span>
          </p>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {hasRate && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative mt-3 text-sm text-slate-300"
          >
            כל <span className="font-semibold text-white">₪100</span> שאתם מוציאים ={' '}
            <span className="font-semibold text-growth">{formatHours(100 / rate)}</span> מהחיים שלכם בעבודה.
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
