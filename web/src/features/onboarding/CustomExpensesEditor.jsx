import { AnimatePresence, motion } from 'framer-motion';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import MoneyInput from '../../components/ui/MoneyInput.jsx';
import TextInput from '../../components/ui/TextInput.jsx';
import { CUSTOM_LIMITS } from '../../lib/catalog.js';
import { customKey, newCustomExpense } from '../../lib/budget.js';
import { useMoney } from '../../state/privacy.js';

const SUGGESTIONS = ['חדר כושר', 'ביטוח רכב', 'תרומה קבועה', 'חיות מחמד', 'טיפול / פסיכולוג'];

/** Dynamic list of user-titled monthly expenses. Rows are validated like any other gate field. */
export default function CustomExpensesEditor({ items, onChange, errorFor, onBlurField, shakeSignal, registerRef, listError }) {
  const money = useMoney();
  const atLimit = items.length >= CUSTOM_LIMITS.maxItems;
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const usedTitles = new Set(items.map((item) => item.title.trim()));

  const add = (title = '') => {
    if (atLimit) return;
    const item = { ...newCustomExpense(), title };
    onChange([...items, item]);
    // Focus the field the user still needs to fill once the row has rendered.
    requestAnimationFrame(() => registerRef.focus(customKey(item.id, title ? 'amount' : 'title')));
  };
  const update = (id, patch) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = (id) => onChange(items.filter((item) => item.id !== id));

  return (
    <div>
      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border-2 border-dashed border-navy/10 px-5 py-8 text-center"
        >
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-mist text-turquoise-dark">
            <ListPlus size={22} />
          </span>
          <p className="mt-3 font-bold text-navy">אין הוצאות אישיות עדיין</p>
          <p className="mt-1 text-sm text-navy-soft">הוסיפו כל הוצאה חודשית שלא מופיעה בקטגוריות — או המשיכו הלאה.</p>
        </motion.div>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl border border-navy/[0.07] bg-surface p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-turquoise-dark">הוצאה {index + 1}</span>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => remove(item.id)}
                  aria-label={`מחיקת ${item.title || `הוצאה ${index + 1}`}`}
                  className="-me-2 grid h-12 w-12 place-items-center rounded-full text-navy/40 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={16} />
                </motion.button>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <TextInput
                  name={customKey(item.id, 'title')}
                  ref={(node) => registerRef.set(customKey(item.id, 'title'), node)}
                  label="שם ההוצאה / כותרת"
                  placeholder="למשל: חדר כושר"
                  maxLength={CUSTOM_LIMITS.maxTitleLength}
                  value={item.title}
                  error={errorFor(customKey(item.id, 'title'))}
                  shakeSignal={shakeSignal}
                  onChange={(title) => update(item.id, { title })}
                  onBlur={onBlurField}
                />
                <MoneyInput
                  name={customKey(item.id, 'amount')}
                  ref={(node) => registerRef.set(customKey(item.id, 'amount'), node)}
                  label="סכום ב-₪"
                  value={item.amount}
                  error={errorFor(customKey(item.id, 'amount'))}
                  shakeSignal={shakeSignal}
                  onChange={(amount) => update(item.id, { amount })}
                  onBlur={onBlurField}
                />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {listError && <p className="mt-3 text-sm font-medium text-danger">{listError}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => add()} disabled={atLimit}>
          <Plus size={16} /> הוספת הוצאה
        </Button>
        {!atLimit &&
          SUGGESTIONS.filter((title) => !usedTitles.has(title))
            .slice(0, 3)
            .map((title) => (
              <motion.button
                key={title}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => add(title)}
                className="min-h-12 rounded-full bg-mist px-4 text-sm font-medium text-navy-soft transition-colors hover:bg-turquoise/10 hover:text-turquoise-dark"
              >
                + {title}
              </motion.button>
            ))}
      </div>

      {items.length > 0 && (
        <p className="mt-4 text-sm text-navy-soft">
          סך הוצאות אישיות: <span className="font-bold tabular-nums text-navy">{money(total)}</span>
          {atLimit && ` · הגעתם למקסימום של ${CUSTOM_LIMITS.maxItems} הוצאות`}
        </p>
      )}
    </div>
  );
}
