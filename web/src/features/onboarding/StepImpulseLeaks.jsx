import { useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { Check, Droplets } from 'lucide-react';
import { IMPULSE_LEAKS, LEAKS_BY_KEY, MAX_LEAKS } from '../../lib/catalog.js';
import { calcHourlyRate, formatCurrency, formatHours, hoursOfLife } from '../../lib/finance.js';

export default function StepImpulseLeaks({ draft, toggleLeak }) {
  const rate = calcHourlyRate(draft.monthly_income, draft.weekly_work_hours);
  const controls = useAnimationControls();
  const [limitHit, setLimitHit] = useState(false);
  const selected = draft.impulse_triggers;

  const monthlyLeak = selected.reduce((sum, key) => {
    const leak = LEAKS_BY_KEY[key];
    return sum + leak.typicalAmount * leak.perMonth;
  }, 0);

  const onToggle = (key) => {
    if (!selected.includes(key) && selected.length >= MAX_LEAKS) {
      setLimitHit(true);
      controls.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.4 } });
      return;
    }
    setLimitHit(false);
    toggleLeak(key);
  };

  return (
    <div className="space-y-5">
      <motion.p animate={controls} className={`text-sm ${limitHit ? 'text-alert' : 'text-slate-400'}`}>
        בחרו עד {MAX_LEAKS} פיתויים שהכי מושכים אתכם. בלי שיפוט — רק כנות.
      </motion.p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {IMPULSE_LEAKS.map((leak, index) => {
          const active = selected.includes(leak.key);
          const Icon = leak.icon;
          const hours = hoursOfLife(leak.typicalAmount * leak.perMonth, rate);
          return (
            <motion.button
              key={leak.key}
              type="button"
              aria-pressed={active}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onToggle(leak.key)}
              className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-start transition-colors ${
                active
                  ? 'border-alert/60 bg-alert/10 shadow-[0_0_0_4px_rgba(245,158,11,0.08)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    active ? 'bg-alert/20 text-alert' : 'bg-white/5 text-slate-300'
                  }`}
                >
                  <Icon size={19} />
                </span>
                <AnimatePresence>
                  {active && (
                    <motion.span
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      className="grid h-6 w-6 place-items-center rounded-full bg-alert text-ink"
                    >
                      <Check size={14} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <span className="font-semibold text-white">{leak.label}</span>
              <span className="text-xs text-slate-500">{leak.hint}</span>
              {rate > 0 && (
                <span className={`text-xs ${active ? 'text-amber-300' : 'text-slate-500'}`}>
                  ≈ {formatHours(hours)} בחודש
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-start gap-3 rounded-2xl border border-alert/25 bg-alert/[0.07] p-4"
          >
            <Droplets className="mt-0.5 shrink-0 text-alert" size={20} />
            <p className="text-sm text-slate-300">
              דליפה משוערת: <span className="font-semibold text-white">{formatCurrency(monthlyLeak)}</span> בחודש
              {rate > 0 && (
                <>
                  {' '}
                  — כ־<span className="font-semibold text-alert">{formatHours(hoursOfLife(monthlyLeak, rate))}</span> של
                  עבודה שלכם.
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
