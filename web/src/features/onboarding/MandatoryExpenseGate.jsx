import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, LockOpen, TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import MoneyInput from '../../components/ui/MoneyInput.jsx';
import { FIELDS, TRACKS } from '../../lib/catalog.js';
import {
  ALL_FIELDS,
  GATE_STEPS,
  buildSnapshot,
  formatCurrency,
  mapServerErrors,
  previewTotals,
  validateFields,
} from '../../lib/budget.js';
import { ApiError, validateGate } from '../../services/api.js';
import { useJourney } from '../../state/JourneyContext.jsx';

const HINTS = {
  rent: 'גרים אצל ההורים או בדירה בבעלות בלי משכנתא? כתבו 0.',
  electricity: 'מקבלים חשבון דו-חודשי? חלקו ב-2.',
  water: 'מקבלים חשבון דו-חודשי? חלקו ב-2.',
  municipal: 'ארנונה חודשית.',
  entertainment: 'יציאות, הופעות, מנויים לסטרימינג וכו׳.',
  dining: 'מסעדות, בתי קפה ומשלוחים.',
  shopping: 'בגדים, גאדג׳טים, קניות אונליין.',
};

export default function MandatoryExpenseGate() {
  const { state, updateBudget, unlockDashboard } = useJourney();
  const profile = state.profile;
  const track = TRACKS[profile.trackId];

  const [values, setValues] = useState(state.budget);
  const [[stepIndex, direction], setStep] = useState([0, 1]);
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [shakeSignal, setShakeSignal] = useState(0);
  const [banner, setBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef({});

  const step = GATE_STEPS[stepIndex];
  const isLast = stepIndex === GATE_STEPS.length - 1;
  const liveErrors = useMemo(() => validateFields(values), [values]);
  const completedFields = ALL_FIELDS.filter((key) => !liveErrors[key]).length;
  const stepIsValid = (s) => s.fields.every((key) => !liveErrors[key] && !serverErrors[key]);

  const visibleError = (key) => serverErrors[key] || ((attempted[step.key] || touched[key]) && liveErrors[key]) || null;

  const setValue = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    updateBudget(next);
    setBanner(null);
    if (serverErrors[key]) setServerErrors(({ [key]: _, ...rest }) => rest);
  };

  const goTo = (index) => {
    setBanner(null);
    setStep(([current]) => [index, index >= current ? 1 : -1]);
  };

  const block = (keys, message) => {
    setAttempted((prev) => ({ ...prev, [step.key]: true }));
    setShakeSignal((n) => n + 1);
    setBanner({ tone: 'warning', message });
    inputRefs.current[keys[0]]?.focus();
  };

  const missingMessage = (keys) =>
    keys.length === 1
      ? `רגע — צריך להשלים את "${FIELDS[keys[0]].label}" כדי להמשיך.`
      : `רגע — יש ${keys.length} שדות להשלים לפני שממשיכים. סימנו אותם באדום.`;

  const submit = async () => {
    const invalid = ALL_FIELDS.filter((key) => liveErrors[key]);
    if (invalid.length) {
      const firstStep = GATE_STEPS.findIndex((s) => s.fields.includes(invalid[0]));
      setAttempted(Object.fromEntries(GATE_STEPS.map((s) => [s.key, true])));
      goTo(firstStep);
      setBanner({ tone: 'warning', message: missingMessage(invalid) });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    try {
      const result = await validateGate(buildSnapshot(profile, values));
      unlockDashboard(values, result.analysis);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const mapped = mapServerErrors(error.fields);
        setServerErrors(mapped);
        setAttempted(Object.fromEntries(GATE_STEPS.map((s) => [s.key, true])));
        const firstStep = GATE_STEPS.findIndex((s) => s.fields.some((key) => mapped[key]));
        if (firstStep >= 0) goTo(firstStep);
        setBanner({ tone: 'warning', message: error.message });
      } else {
        setBanner({ tone: 'error', message: `${error.message} הדשבורד יישאר נעול עד שהנתונים יאומתו.` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    const invalid = step.fields.filter((key) => liveErrors[key] || serverErrors[key]);
    if (invalid.length) {
      block(invalid, missingMessage(invalid));
      return;
    }
    if (isLast) submit();
    else goTo(stepIndex + 1);
  };

  const canJumpTo = (index) => index <= stepIndex || GATE_STEPS.slice(0, index).every(stepIsValid);
  const totals = previewTotals(values);
  const suggestedReserve = Math.max(100, Math.round((Number(values.income) || 0) * track.minUnexpectedShare));
  const StepIcon = step.icon;

  return (
    <div>
      {/* Gate status */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-navy/[0.06] bg-mist px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-navy shadow-sm">
          <Lock size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy">הדשבורד נעול עד שכל הנתונים יושלמו</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-l from-turquoise to-mint"
              animate={{ width: `${(completedFields / ALL_FIELDS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
        <span className="text-sm font-bold tabular-nums text-navy-soft">
          {completedFields}/{ALL_FIELDS.length}
        </span>
      </div>

      {/* Sub-step tabs */}
      <nav aria-label="שלבי הנתונים" className="mb-8 grid grid-cols-4 gap-2">
        {GATE_STEPS.map((s, i) => {
          const done = i < stepIndex && stepIsValid(s);
          const current = i === stepIndex;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!canJumpTo(i)}
              onClick={() => goTo(i)}
              aria-current={current ? 'step' : undefined}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:flex-row sm:justify-center sm:text-sm ${
                current ? 'bg-turquoise/10 text-turquoise-dark' : done ? 'text-navy' : 'text-navy-soft hover:bg-mist'
              }`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${
                  done ? 'bg-mint text-navy' : current ? 'bg-turquoise text-white' : 'bg-navy/[0.06]'
                }`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
              </span>
              <span className="truncate">{s.title.replace('?', '')}</span>
            </button>
          );
        })}
      </nav>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step.key}
            custom={direction}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white shadow-[var(--shadow-glow)]">
                <StepIcon size={22} />
              </span>
              <div>
                <p className="text-sm font-bold text-turquoise-dark">
                  שלב {stepIndex + 1} מתוך {GATE_STEPS.length}
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{step.title}</h1>
                <p className="mt-1 text-navy-soft">{step.subtitle}</p>
              </div>
            </div>

            <div className={`mt-8 grid gap-5 ${step.fields.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {step.fields.map((key) => (
                <MoneyInput
                  key={key}
                  ref={(node) => {
                    inputRefs.current[key] = node;
                  }}
                  label={FIELDS[key].label}
                  hint={key === 'unexpected' ? `המלצה ל${track.name}: לפחות ${formatCurrency(suggestedReserve)} בחודש.` : HINTS[key]}
                  value={values[key]}
                  error={visibleError(key)}
                  shakeSignal={shakeSignal}
                  large={step.fields.length === 1}
                  onChange={(value) => setValue(key, value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, [key]: true }))}
                />
              ))}
            </div>

            {isLast && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-8 grid grid-cols-3 gap-3 rounded-3xl bg-mist p-4 sm:p-5"
              >
                <Summary label="הכנסה" value={totals.income} />
                <Summary label="סך הוצאות" value={totals.expenses} />
                <Summary label="נשאר בסוף החודש" value={totals.remaining} highlight />
              </motion.div>
            )}
          </motion.section>
        </AnimatePresence>

        <AnimatePresence>
          {banner && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium ${
                banner.tone === 'error'
                  ? 'border-danger/30 bg-danger/[0.06] text-danger'
                  : 'border-amber-300/60 bg-amber-50 text-amber-800'
              }`}
            >
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              {banner.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex items-center gap-3">
          {stepIndex > 0 && (
            <Button variant="secondary" onClick={() => goTo(stepIndex - 1)} disabled={submitting} aria-label="לשלב הקודם">
              <ArrowRight size={18} />
            </Button>
          )}
          <Button type="submit" className="flex-1 sm:flex-none sm:px-10" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> מאמתים את הנתונים…
              </>
            ) : isLast ? (
              <>
                <LockOpen size={18} /> פתיחת הדשבורד
              </>
            ) : (
              <>
                המשך <ArrowLeft size={18} />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Summary({ label, value, highlight = false }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-navy-soft">{label}</p>
      <p
        className={`truncate text-lg font-extrabold tabular-nums sm:text-xl ${
          highlight ? (value < 0 ? 'text-danger' : 'text-turquoise-dark') : 'text-navy'
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
