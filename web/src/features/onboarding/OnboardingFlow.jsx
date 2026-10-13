import { useReducer, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import GlassCard from '../../components/ui/GlassCard.jsx';
import Button from '../../components/ui/Button.jsx';
import StepBasics from './StepBasics.jsx';
import StepImpulseLeaks from './StepImpulseLeaks.jsx';
import StepCoachPersona from './StepCoachPersona.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';

const initialDraft = {
  full_name: '',
  monthly_income: '',
  weekly_work_hours: 42,
  current_savings: '',
  dream_goal: '',
  dream_goal_key: null,
  dream_goal_amount: '',
  impulse_triggers: [],
  coach_persona: null,
};

function draftReducer(state, action) {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'toggle_leak': {
      const has = state.impulse_triggers.includes(action.key);
      return {
        ...state,
        impulse_triggers: has
          ? state.impulse_triggers.filter((k) => k !== action.key)
          : [...state.impulse_triggers, action.key],
      };
    }
    default:
      return state;
  }
}

const STEPS = [
  {
    key: 'basics',
    eyebrow: 'שלב 1 · היסודות',
    title: 'בואו נכיר את הכסף שלכם',
    subtitle: 'נתרגם כל שקל לזמן — המטבע האמיתי של החיים.',
    Component: StepBasics,
    validate: (d) =>
      d.full_name.trim().length >= 2 &&
      Number(d.monthly_income) > 0 &&
      d.dream_goal.trim().length >= 2 &&
      Number(d.dream_goal_amount) > 0,
  },
  {
    key: 'leaks',
    eyebrow: 'שלב 2 · זיהוי דליפות',
    title: 'איפה הכסף בורח לכם?',
    subtitle: 'הצעד הראשון לשינוי הרגל הוא לתת לו שם.',
    Component: StepImpulseLeaks,
    validate: (d) => d.impulse_triggers.length > 0,
  },
  {
    key: 'persona',
    eyebrow: 'שלב 3 · המאמן שלכם',
    title: 'בחרו את הקול שילווה אתכם',
    subtitle: 'מאמן AI שמדבר בשפה שבאמת מזיזה אתכם.',
    Component: StepCoachPersona,
    validate: (d) => Boolean(d.coach_persona),
  },
];

const slide = {
  enter: (dir) => ({ x: dir > 0 ? -56 : 56, opacity: 0, filter: 'blur(6px)' }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dir) => ({ x: dir > 0 ? 56 : -56, opacity: 0, filter: 'blur(6px)' }),
};

export default function OnboardingFlow() {
  const { completeOnboarding } = useAppState();
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [[stepIndex, direction], setStep] = useState([0, 1]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const canContinue = step.validate(draft);
  const update = (field, value) => dispatch({ type: 'set', field, value });
  const toggleLeak = (key) => dispatch({ type: 'toggle_leak', key });

  const go = (delta) => setStep(([i]) => [Math.min(Math.max(i + delta, 0), STEPS.length - 1), delta]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await completeOnboarding({
        full_name: draft.full_name.trim(),
        monthly_income: Number(draft.monthly_income),
        weekly_work_hours: Number(draft.weekly_work_hours),
        current_savings: Number(draft.current_savings) || 0,
        dream_goal: draft.dream_goal.trim(),
        dream_goal_amount: Number(draft.dream_goal_amount),
        impulse_triggers: draft.impulse_triggers,
        coach_persona: draft.coach_persona,
      });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const onPrimary = () => {
    if (!canContinue || submitting) return;
    if (isLast) submit();
    else go(1);
  };

  const { Component } = step;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-8 pt-6 sm:pt-10">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-growth/15 text-growth">
            <Sparkles size={18} />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">AuraFin</span>
        </div>
        <span className="text-sm tabular-nums text-slate-500">
          {stepIndex + 1}/{STEPS.length}
        </span>
      </header>

      <div className="mb-6 flex gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1}>
        {STEPS.map((s, i) => (
          <div key={s.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-growth"
              initial={false}
              animate={{ width: i <= stepIndex ? '100%' : '0%' }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        ))}
      </div>

      <GlassCard className="flex-1" glow="bg-growth/20">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step.key}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-growth">{step.eyebrow}</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{step.title}</h1>
            <p className="mb-6 mt-1 text-slate-400">{step.subtitle}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onPrimary();
              }}
            >
              <Component draft={draft} update={update} toggleLeak={toggleLeak} />
              <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
          </motion.section>
        </AnimatePresence>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center gap-3">
          {stepIndex > 0 && (
            <Button variant="ghost" onClick={() => go(-1)} disabled={submitting} aria-label="חזרה">
              <ArrowRight size={18} />
            </Button>
          )}
          <Button className="flex-1" onClick={onPrimary} disabled={!canContinue || submitting}>
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> בונים את הדשבורד…
              </>
            ) : isLast ? (
              <>
                יוצאים לדרך <Sparkles size={18} />
              </>
            ) : (
              <>
                המשך <ArrowLeft size={18} />
              </>
            )}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
