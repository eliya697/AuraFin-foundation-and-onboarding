import { forwardRef, memo, useEffect, useId } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

const TextInput = forwardRef(function TextInput(
  { name, label, value, error, onChange, onBlur, placeholder, maxLength, shakeSignal = 0 },
  ref,
) {
  const id = useId();
  const errorId = `${id}-error`;
  const controls = useAnimationControls();

  useEffect(() => {
    if (shakeSignal > 0 && error) controls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  }, [shakeSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-navy">
        {label}
      </label>
      <motion.input
        ref={ref}
        id={id}
        animate={controls}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value, name)}
        onBlur={() => onBlur?.(name)}
        className={`w-full rounded-2xl border-2 bg-surface px-4 py-3.5 text-lg font-semibold text-navy outline-none transition-colors placeholder:font-normal placeholder:text-navy/30 focus:ring-4 ${
          error
            ? 'border-danger/70 bg-danger/[0.03] focus:ring-danger/10'
            : 'border-navy/10 focus:border-turquoise focus:ring-turquoise/15'
        }`}
      />
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
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
        )}
      </AnimatePresence>
    </div>
  );
});

/** Memoised: callbacks receive `name`, so parents can pass one stable handler for every field. */
export default memo(TextInput);
