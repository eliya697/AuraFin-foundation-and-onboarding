import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, LockOpen, PencilLine, TriangleAlert, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import MoneyInput from '../../components/ui/MoneyInput.jsx';
import CustomExpensesEditor from './CustomExpensesEditor.jsx';
import { CATALOG, FIELDS, TRACKS } from '../../lib/catalog.js';
import {
  buildSnapshot,
  formatCurrency,
  gateProgress,
  getGateSteps,
  mapServerErrors,
  previewTotals,
  stepOwnsError,
  validateBudget,
  validateSteps,
} from '../../lib/budget.js';
import { analyzeBudget } from '../../lib/analysis.js';
import { ApiError, OfflineError, validateGate } from '../../services/api.js';
import { useJourney } from '../../state/JourneyContext.jsx';
import { BACK_PRIORITY, useBackHandler } from '../../hooks/useBackHandler.js';
import { useLastDefined } from '../../hooks/useLastDefined.js';

const HINTS = {
  rent: 'גרים אצל ההורים או בדירה בבעלות בלי משכנתא? כתבו 0.',
  electricity: 'מקבלים חשבון דו-חודשי? חלקו ב-2.',
  water: 'מקבלים חשבון דו-חודשי? חלקו ב-2.',
  municipal: 'ארנונה חודשית.',
  entertainment: 'יציאות, הופעות, מנויים לסטרימינג וכו׳.',
  dining: 'מסעדות, בתי קפה ומשלוחים.',
  shopping: 'בגדים, גאדג׳טים, קניות אונליין.',
};

/**
 * The budget is read from and written straight to the journey store (no local copy), so a cloud
 * refresh, a cancel or a remount can never leave the form and the store disagreeing.
 */
export default function MandatoryExpenseGate() {
  const { state, updateBudget, unlockDashboard, cancelEdit, reopenQuiz } = useJourney();
  // Kept from the last render while this screen animates out after the profile was cleared.
  const profile = useLastDefined(state.profile);
  const values = state.budget;
  const editing = Boolean(state.editing?.original);
  const track = TRACKS[profile?.trackId];
  const steps = useMemo(() => getGateSteps(profile), [profile]);

  const [[stepIndex, direction], setStep] = useState([0, 1]);
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [shakeSignal, setShakeSignal] = useState(0);
  const [banner, setBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef({});
  const refCallbacks = useRef(new Map());
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;
  const liveErrors = useMemo(() => validateBudget(values, profile), [values, profile]);
  const progress = useMemo(() => gateProgress(values, profile), [values, profile]);
  const stepErrorKeys = (s) =>
    [...Object.keys(liveErrors), ...Object.keys(serverErrors)].filter((key) => stepOwnsError(s, key));
  const stepIsValid = (s) => stepErrorKeys(s).length === 0;

  const visibleError = (key) => serverErrors[key] || ((attempted[step.key] || touched[key]) && liveErrors[key]) || null;
  const markTouched = useCallback((key) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true })), []);

  const refs = useMemo(
    () => ({
      set: (key, node) => {
        inputRefs.current[key] = node;
      },
      /** Stable callback ref per field, so memoised inputs are not re-rendered by a new ref. */
      for: (key) => {
        if (!refCallbacks.current.has(key)) refCallbacks.current.set(key, (node) => (inputRefs.current[key] = node));
        return refCallbacks.current.get(key);
      },
      focus: (key) => inputRefs.current[key]?.focus({ preventScroll: false }),
    }),
    [],
  );

  const commit = useCallback(
    (next, changedKeys) => {
      updateBudget(next);
      setBanner(null);
      setServerErrors((prev) => {
        if (!changedKeys.some((key) => prev[key])) return prev;
        return Object.fromEntries(Object.entries(prev).filter(([key]) => !changedKeys.includes(key)));
      });
    },
    [updateBudget],
  );

  const setValue = useCallback((value, key) => commit({ ...valuesRef.current, [key]: value }, [key]), [commit]);
  const setCustom = useCallback(
    (custom) =>
      commit(
        { ...valuesRef.current, custom },
        Object.keys(serverErrors).filter((k) => k.startsWith('custom')),
      ),
    [commit, serverErrors],
  );

  const goTo = (index) => {
    setBanner(null);
    setStep(([current]) => [index, index >= current ? 1 : -1]);
  };

  // System back button: previous step → leave the edit (or return to the quiz during onboarding).
  useBackHandler(() => goTo(safeIndex - 1), { enabled: safeIndex > 0 && !submitting, priority: BACK_PRIORITY.step });
  useBackHandler(() => (editing ? cancelEdit() : reopenQuiz()), { enabled: !submitting, priority: BACK_PRIORITY.screen });

  if (!profile || !track || !step) return null;

  const describe = (keys) => {
    if (keys.length !== 1) return `רגע — יש ${keys.length} שדות להשלים לפני שממשיכים. סימנו אותם באדום.`;
    const label = FIELDS[keys[0]]?.label ?? 'ההוצאה האישית';
    return `רגע — צריך להשלים את "${label}" כדי להמשיך.`;
  };

  const blockOn = (keys, stepKey = step.key) => {
    setAttempted((prev) => ({ ...prev, [stepKey]: true }));
    setShakeSignal((n) => n + 1);
    setBanner({ tone: 'warning', message: describe(keys) });
    refs.focus(keys[0]);
  };

  const unlockOffline = (reason) => {
    const analysis = analyzeBudget(buildSnapshot(profile, values), CATALOG);
    unlockDashboard(values, analysis, 'offline');
    console.info(`[AuraFin] Gate validated locally (${reason}).`);
  };

  const submit = async () => {
    const invalid = Object.keys(validateSteps(steps, values));
    if (invalid.length) {
      const firstStep = steps.findIndex((s) => stepOwnsError(s, invalid[0]));
      setAttempted(Object.fromEntries(steps.map((s) => [s.key, true])));
      goTo(Math.max(firstStep, 0));
      setBanner({ tone: 'warning', message: describe(invalid) });
      return;
    }

    const submitted = values;
    setSubmitting(true);
    setBanner(null);
    try {
      const result = await validateGate(buildSnapshot(profile, submitted));
      unlockDashboard(submitted, result.analysis, 'server');
    } catch (error) {
      if (error instanceof OfflineError) {
        // The API is absent/unreachable (e.g. GitHub Pages answers 405, or the host is asleep).
        // Every rule already passed client-side, so unlock locally; the dashboard re-verifies
        // against the server in the background once it is reachable.
        unlockOffline(error.reason);
      } else if (error instanceof ApiError && error.status === 422) {
        const mapped = mapServerErrors(error.fields, submitted);
        setServerErrors(mapped);
        setAttempted(Object.fromEntries(steps.map((s) => [s.key, true])));
        const firstStep = steps.findIndex((s) => Object.keys(mapped).some((key) => stepOwnsError(s, key)));
        if (firstStep >= 0) goTo(firstStep);
        setBanner({ tone: 'warning', message: error.message });
      } else {
        setBanner({ tone: 'error', message: `${error?.message ?? 'שגיאה לא צפויה.'} הדשבורד יישאר נעול עד שהנתונים יאומתו.` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    const invalid = stepErrorKeys(step);
    if (invalid.length) {
      blockOn(invalid);
      return;
    }
    if (isLast) submit();
    else goTo(safeIndex + 1);
  };

  const canJumpTo = (index) => index <= safeIndex || steps.slice(0, index).every(stepIsValid);
  const totals = previewTotals(values, profile);
  const suggestedReserve = (() => {
    const { reserveBoostPerChild, reserveBoostMax } = CATALOG.children;
    const boost = profile.hasChildren ? Math.min(profile.childrenCount * reserveBoostPerChild, reserveBoostMax) : 0;
    return Math.max(100, Math.round((Number(values.income) || 0) * (track.minUnexpectedShare + boost)));
  })();
  const StepIcon = step.icon;

  return (
    <div>
      {/* Gate status */}
      {editing ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-turquoise/20 bg-turquoise/[0.06] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-turquoise-dark shadow-sm">
            <PencilLine size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy">עריכת נתונים</p>
            <p className="text-xs text-navy-soft">התוכנית תחושב מחדש באישור</p>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={submitting} aria-label="ביטול העריכה וחזרה לדשבורד">
            <X size={16} /> ביטול
          </Button>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-navy/[0.06] bg-mist px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-navy shadow-sm">
            <Lock size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy">הדשבורד נעול עד שכל הנתונים יושלמו</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy/[0.08]">
              <div
                className="h-full origin-right rounded-full bg-gradient-to-l from-turquoise to-mint transition-transform duration-400 ease-out"
                style={{ transform: `scaleX(${progress.total ? progress.done / progress.total : 0})` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-navy-soft">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}

      {/* Sub-step tabs */}
      <nav
        aria-label="שלבי הנתונים"
        className="no-scrollbar -mx-1 mb-8 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:grid sm:overflow-visible"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((s, i) => {
          const done = i < safeIndex && stepIsValid(s);
          const current = i === safeIndex;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!canJumpTo(i)}
              onClick={() => goTo(i)}
              aria-current={current ? 'step' : undefined}
              aria-label={s.title}
              className={`flex min-h-12 min-w-12 shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 lg:flex-row ${
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
              <span className="hidden truncate sm:inline">{s.tab}</span>
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
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white shadow-[var(--shadow-glow)]">
                <StepIcon size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-turquoise-dark">
                  שלב {safeIndex + 1} מתוך {steps.length}
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{step.title}</h1>
                <p className="mt-1 text-navy-soft">
                  {step.key === 'children'
                    ? `${step.subtitle} (${profile.childrenCount === 1 ? 'ילד אחד' : `${profile.childrenCount} ילדים`})`
                    : step.subtitle}
                </p>
              </div>
            </div>

            <div className="mt-8">
              {step.isCustomList ? (
                <CustomExpensesEditor
                  items={values.custom}
                  onChange={setCustom}
                  errorFor={visibleError}
                  onBlurField={markTouched}
                  shakeSignal={shakeSignal}
                  registerRef={refs}
                  listError={visibleError('custom')}
                />
              ) : (
                <div className={`grid gap-5 ${step.fields.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                  {step.fields.map((key) => (
                    <MoneyInput
                      key={key}
                      name={key}
                      ref={refs.for(key)}
                      label={FIELDS[key].label}
                      hint={
                        key === 'unexpected'
                          ? `המלצה ל${track.name}${profile.hasChildren ? ' עם ילדים' : ''}: לפחות ${formatCurrency(suggestedReserve)} בחודש.`
                          : HINTS[key]
                      }
                      value={values[key]}
                      error={visibleError(key)}
                      shakeSignal={shakeSignal}
                      large={step.fields.length === 1}
                      onChange={setValue}
                      onBlur={markTouched}
                    />
                  ))}
                </div>
              )}
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
          {safeIndex > 0 && (
            <Button variant="secondary" size="icon" onClick={() => goTo(safeIndex - 1)} disabled={submitting} aria-label="לשלב הקודם">
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
                <LockOpen size={18} /> {editing ? 'שמירה וחישוב מחדש' : 'פתיחת הדשבורד'}
              </>
            ) : (
              <>
                {step.isCustomList && values.custom.length === 0 ? 'אין לי, המשך' : 'המשך'} <ArrowLeft size={18} />
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
