import { forwardRef, memo, useEffect, useId } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { sanitizeAmount } from '../../lib/budget.js';

const MoneyInput = forwardRef(function MoneyInput({ name, label, hint, value, error, onChange, onBlur, shakeSignal = 0, large = false }, ref) {
  const id = useId();
  const controls = useAnimationControls();

  // Re-shake every time a blocked "next" attempt is made while this field is invalid.
  useEffect(() => {
    if (shakeSignal > 0 && error) controls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  }, [shakeSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-navy">
        {label}
      </label>
      <motion.div
        animate={controls}
        className={`flex items-center rounded-2xl border-2 bg-surface transition-colors focus-within:ring-4 ${
          error
            ? 'border-danger/70 bg-danger/[0.03] focus-within:ring-danger/10'
            : 'border-navy/10 focus-within:border-turquoise focus-within:ring-turquoise/15'
        }`}
      >
        <input
          ref={ref}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="0"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(sanitizeAmount(e.target.value), name)}
          onBlur={() => onBlur?.(name)}
          className={`money-input w-full bg-transparent px-4 font-bold tabular-nums text-navy outline-none placeholder:font-normal placeholder:text-navy/25 ${
            large ? 'py-4 text-3xl' : 'py-3.5 text-lg'
          }`}
        />
        <span className={`pe-4 font-semibold ${error ? 'text-danger' : 'text-navy/35'} ${large ? 'text-2xl' : 'text-lg'}`}>
          ₪
        </span>
      </motion.div>
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger"
          >
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </motion.p>
        ) : (
          hint && (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 text-sm text-navy-soft/80">
              {hint}
            </motion.p>
          )
        )}
      </AnimatePresence>
    </div>
  );
});

/** Memoised: callbacks receive `name`, so parents can pass one stable handler for every field. */
export default memo(MoneyInput);
