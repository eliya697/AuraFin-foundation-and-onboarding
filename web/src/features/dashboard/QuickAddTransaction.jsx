import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, PlusCircle } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard.jsx';
import Button from '../../components/ui/Button.jsx';
import HoldToConfirm from './HoldToConfirm.jsx';
import { CATEGORY_META, IMPULSE_LEAKS } from '../../lib/catalog.js';
import { formatHours, hoursOfLife, workDaysFromHours, formatNumber } from '../../lib/finance.js';
import { useAppState } from '../../state/AppStateContext.jsx';

const CATEGORIES = ['impulse', 'fun', 'must'];

export default function QuickAddTransaction({ profile }) {
  const { addTransaction } = useAppState();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('impulse');
  const [merchant, setMerchant] = useState('');
  const [triggerKey, setTriggerKey] = useState(profile.impulse_triggers[0] ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const value = Number(amount);
  const valid = value > 0;
  const hours = hoursOfLife(value, profile.hourly_rate);
  const days = workDaysFromHours(hours, profile.weekly_work_hours);

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const now = new Date();
    const flags = [];
    if (category === 'impulse') {
      flags.push('flagged_impulse', 'friction_confirmed');
      if (now.getHours() >= 22 || now.getHours() < 5) flags.push('late_night');
    }
    try {
      await addTransaction({
        amount: Math.round(value * 100) / 100,
        category,
        merchant: merchant.trim(),
        trigger_key: category === 'impulse' ? triggerKey || null : null,
        occurred_at: now.toISOString(),
        flags,
      });
      setAmount('');
      setMerchant('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard className="h-full">
      <div className="flex items-center gap-2">
        <PlusCircle size={18} className="text-growth" />
        <h2 className="text-base font-bold text-white">רישום הוצאה</h2>
      </div>

      <div className="mt-4 space-y-4">
        <div role="radiogroup" aria-label="קטגוריה" className="relative grid grid-cols-3 rounded-2xl border border-white/10 bg-white/5 p-1">
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={category === key}
              onClick={() => setCategory(key)}
              className={`relative rounded-xl py-2 text-sm font-semibold transition-colors ${
                category === key ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {category === key && (
                <motion.span
                  layoutId="category-pill"
                  className={`absolute inset-0 rounded-xl ${key === 'impulse' ? 'bg-alert/25' : 'bg-white/10'}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">{CATEGORY_META[key].label}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            aria-label="סכום"
            className="field pe-10 text-2xl font-bold tabular-nums"
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 end-4 grid place-items-center text-lg text-slate-500">₪</span>
        </div>

        <input
          aria-label="איפה?"
          className="field"
          placeholder="איפה? (לא חובה)"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />

        <AnimatePresence initial={false}>
          {category === 'impulse' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <select
                aria-label="סוג הפיתוי"
                className="field"
                value={triggerKey}
                onChange={(e) => setTriggerKey(e.target.value)}
              >
                <option value="">סוג הפיתוי…</option>
                {IMPULSE_LEAKS.map((leak) => (
                  <option key={leak.key} value={leak.key} className="bg-ink">
                    {leak.label}
                  </option>
                ))}
              </select>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {valid && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className={`rounded-2xl p-3 text-sm ${category === 'impulse' ? 'bg-alert/10 text-amber-100' : 'bg-white/5 text-slate-300'}`}
            >
              זה <span className="font-bold">{formatHours(hours)}</span> של עבודה
              {days >= 0.5 && <> ({formatNumber(Math.round(days * 10) / 10)} ימי עבודה)</>}.
              {category === 'impulse' && ' עדיין שווה את זה?'}
            </motion.div>
          )}
        </AnimatePresence>

        {justSaved ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center justify-center gap-2 rounded-2xl bg-growth/15 py-3.5 font-semibold text-growth"
          >
            <CheckCircle2 size={18} /> נרשם
          </motion.div>
        ) : category === 'impulse' ? (
          <HoldToConfirm onConfirm={submit} disabled={!valid || saving}>
            החזיקו כדי לאשר
          </HoldToConfirm>
        ) : (
          <Button className="w-full" onClick={submit} disabled={!valid || saving}>
            הוספה
          </Button>
        )}
      </div>
    </GlassCard>
  );
}
