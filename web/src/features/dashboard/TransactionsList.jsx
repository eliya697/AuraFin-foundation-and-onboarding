import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Receipt, Trash2 } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard.jsx';
import { CATEGORY_META, LEAKS_BY_KEY } from '../../lib/catalog.js';
import { formatCurrency, formatHours, hoursOfLife } from '../../lib/finance.js';
import { useAppState } from '../../state/AppStateContext.jsx';

const dateFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const PAGE = 8;

export default function TransactionsList({ profile, transactions }) {
  const { clearSampleData } = useAppState();
  const [expanded, setExpanded] = useState(false);
  const hasSample = transactions.some((tx) => tx.flags?.includes('sample'));
  const rows = expanded ? transactions : transactions.slice(0, PAGE);

  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-slate-400" />
          <h2 className="text-base font-bold text-white">פעילות אחרונה</h2>
        </div>
        {hasSample && (
          <button
            type="button"
            onClick={clearSampleData}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300"
          >
            <Trash2 size={13} /> הסרת נתוני הדגמה
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">עוד אין הוצאות. רשמו את הראשונה כדי שהמאמן יתחיל לעבוד.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/5">
          <AnimatePresence initial={false}>
            {rows.map((tx) => {
              const meta = CATEGORY_META[tx.category];
              const leak = tx.trigger_key ? LEAKS_BY_KEY[tx.trigger_key] : null;
              return (
                <motion.li
                  key={tx.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 py-3"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {tx.merchant || leak?.label || meta.label}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={meta.text}>{meta.label}</span>
                      {leak && <span>· {leak.label}</span>}
                      <span>· {dateFormatter.format(new Date(tx.occurred_at))}</span>
                      {tx.flags?.includes('late_night') && <Moon size={11} className="text-indigo-300" aria-label="רכישה לילית" />}
                      {tx.flags?.includes('sample') && <span className="rounded bg-white/5 px-1.5 text-[10px]">הדגמה</span>}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold tabular-nums text-white">{formatCurrency(tx.amount, profile.currency)}</p>
                    <p className={`text-xs tabular-nums ${tx.category === 'impulse' ? 'text-amber-300/80' : 'text-slate-500'}`}>
                      {formatHours(hoursOfLife(tx.amount, profile.hourly_rate))}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {transactions.length > PAGE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-xl py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          {expanded ? 'הצג פחות' : `הצג את כל ${transactions.length} ההוצאות`}
        </button>
      )}
    </GlassCard>
  );
}
