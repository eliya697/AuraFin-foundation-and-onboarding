import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Baby, Minus, Plus, Target, UserRound, X } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import OptionCard from '../../components/ui/OptionCard.jsx';
import { GOALS, LIFE_STAGES, recommendTracks } from '../../lib/catalog.js';
import { MAX_CHILDREN, formatPercent } from '../../lib/budget.js';
import { BACK_PRIORITY, useBackHandler } from '../../hooks/useBackHandler.js';

const QUESTIONS = [
  { key: 'lifeStage', eyebrow: 'שאלה 1 מתוך 3', title: 'מי אתם?', subtitle: 'נתאים את הרף לשלב בחיים שלכם.' },
  { key: 'goal', eyebrow: 'שאלה 2 מתוך 3', title: 'מה המטרה העיקרית?', subtitle: 'אפשר לשנות בהמשך. בחרו את מה שהכי בוער.' },
  { key: 'children', eyebrow: 'שאלה 3 מתוך 3', title: 'יש לכם ילדים?', subtitle: 'ילדים משנים את התקציב — ואת גודל הכרית שכדאי לשמור בצד.' },
  { key: 'trackId', eyebrow: 'המסלול שלכם', title: 'בחרו מסלול', subtitle: 'לפי התשובות שלכם, זה המסלול שאנחנו ממליצים עליו.' },
];

const AUTO_ADVANCE_MS = 320;

const slide = {
  enter: (dir) => ({ opacity: 0, y: 24, x: dir > 0 ? -24 : 24 }),
  center: { opacity: 1, y: 0, x: 0 },
  exit: (dir) => ({ opacity: 0, y: -12, x: dir > 0 ? 24 : -24 }),
};

function isAnswered(key, answers) {
  if (key === 'children') {
    if (answers.hasChildren === false) return true;
    return answers.hasChildren === true && answers.childrenCount >= 1 && answers.childrenCount <= MAX_CHILDREN;
  }
  return Boolean(answers[key]);
}

function ChildrenCounter({ value, onChange }) {
  const clamp = (n) => Math.min(MAX_CHILDREN, Math.max(1, n));
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-mist p-5">
        <label htmlFor="children-count" className="font-bold text-navy">
          כמה ילדים?
        </label>
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(clamp(value - 1))}
            disabled={value <= 1}
            aria-label="פחות ילדים"
            className="grid h-12 w-12 place-items-center rounded-2xl border border-navy/10 bg-surface text-navy shadow-sm disabled:opacity-40"
          >
            <Minus size={18} />
          </motion.button>
          <input
            id="children-count"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              onChange(digits === '' ? 0 : clamp(Number(digits)));
            }}
            className="w-16 rounded-2xl border-2 border-navy/10 bg-surface py-2 text-center text-2xl font-extrabold tabular-nums text-navy outline-none focus:border-turquoise"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(clamp(value + 1))}
            disabled={value >= MAX_CHILDREN}
            aria-label="יותר ילדים"
            className="grid h-12 w-12 place-items-center rounded-2xl bg-turquoise text-white shadow-sm disabled:opacity-40"
          >
            <Plus size={18} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/** `onCancel` (optional): leave without saving — shown when the quiz was reopened to edit the profile. */
export default function OnboardingQuiz({ initialProfile, onComplete, onCancel }) {
  const [answers, setAnswers] = useState({
    lifeStage: initialProfile?.lifeStage ?? null,
    goal: initialProfile?.goal ?? null,
    hasChildren: typeof initialProfile?.hasChildren === 'boolean' ? initialProfile.hasChildren : null,
    childrenCount: initialProfile?.childrenCount || 1,
    trackId: initialProfile?.trackId ?? null,
  });
  const [[step, direction], setStep] = useState([0, 1]);
  const question = QUESTIONS[step];

  const go = (delta) => setStep(([current]) => [Math.max(0, current + delta), delta]);

  // System back button: previous question first, then leave the edit.
  useBackHandler(() => go(-1), { enabled: step > 0, priority: BACK_PRIORITY.step });
  useBackHandler(() => onCancel?.(), { enabled: Boolean(onCancel), priority: BACK_PRIORITY.screen });
  const advanceFrom = (from) =>
    // Advance only if still on the same question (guards against double taps).
    setTimeout(() => setStep(([current, dir]) => (current === from ? [current + 1, 1] : [current, dir])), AUTO_ADVANCE_MS);

  const answer = (key, value) => {
    setAnswers((prev) => ({
      ...prev,
      [key]: value,
      // Changing the profile changes the recommendations, so a chosen track is reset.
      ...(key !== 'trackId' && key !== 'childrenCount' && prev[key] !== value ? { trackId: null } : {}),
    }));
    if (key === 'lifeStage' || key === 'goal' || (key === 'hasChildren' && value === false)) advanceFrom(step);
  };

  const finish = () =>
    onComplete({
      lifeStage: answers.lifeStage,
      goal: answers.goal,
      hasChildren: answers.hasChildren,
      childrenCount: answers.hasChildren ? answers.childrenCount : 0,
      trackId: answers.trackId,
    });

  const tracks = answers.lifeStage && answers.goal ? recommendTracks(answers.lifeStage, answers.goal, answers.hasChildren) : [];
  const canContinue = isAnswered(question.key, answers);
  const isLast = step === QUESTIONS.length - 1;

  return (
    <div>
      <div className="mb-8 flex gap-2" aria-hidden="true">
        {QUESTIONS.map((q, i) => (
          <div key={q.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy/[0.07]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-l from-turquoise to-mint"
              initial={false}
              animate={{ width: i <= step ? '100%' : '0%' }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.section
          key={question.key}
          custom={direction}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-sm font-bold text-turquoise-dark">{question.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{question.title}</h1>
          <p className="mt-2 text-navy-soft">{question.subtitle}</p>

          <div role="radiogroup" aria-label={question.title} className="mt-8">
            {question.key === 'lifeStage' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {LIFE_STAGES.map((stage, i) => (
                  <OptionCard
                    key={stage.id}
                    icon={stage.icon}
                    title={stage.label}
                    description={stage.description}
                    selected={answers.lifeStage === stage.id}
                    onSelect={() => answer('lifeStage', stage.id)}
                    delay={i * 0.06}
                  />
                ))}
              </div>
            )}

            {question.key === 'goal' && (
              <div className="grid gap-4 sm:grid-cols-3">
                {GOALS.map((goal, i) => (
                  <OptionCard
                    key={goal.id}
                    icon={goal.icon}
                    title={goal.label}
                    description={goal.description}
                    selected={answers.goal === goal.id}
                    onSelect={() => answer('goal', goal.id)}
                    delay={i * 0.06}
                  />
                ))}
              </div>
            )}

            {question.key === 'children' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <OptionCard
                    icon={Baby}
                    title="כן, יש ילדים"
                    description="נוסיף שלב קצר להוצאות עליהם"
                    selected={answers.hasChildren === true}
                    onSelect={() => answer('hasChildren', true)}
                  />
                  <OptionCard
                    icon={UserRound}
                    title="לא"
                    description="ממשיכים הלאה"
                    selected={answers.hasChildren === false}
                    onSelect={() => answer('hasChildren', false)}
                    delay={0.06}
                  />
                </div>
                <AnimatePresence>
                  {answers.hasChildren === true && (
                    <ChildrenCounter value={answers.childrenCount} onChange={(n) => answer('childrenCount', n)} />
                  )}
                </AnimatePresence>
              </>
            )}

            {question.key === 'trackId' && (
              <div className="grid gap-5 pt-3 md:grid-cols-3">
                {tracks.map((track, i) => (
                  <OptionCard
                    key={track.id}
                    icon={Target}
                    title={track.name}
                    description={track.tagline}
                    badge={track.recommended ? 'מומלץ עבורכם' : null}
                    selected={answers.trackId === track.id}
                    onSelect={() => answer('trackId', track.id)}
                    delay={i * 0.08}
                  >
                    <div className="mt-1 w-full rounded-2xl bg-mist px-4 py-3">
                      <p className="text-xs text-navy-soft">יעד חיסכון חודשי</p>
                      <p className="text-xl font-extrabold text-navy">{formatPercent(track.savingsRate)} מההכנסה</p>
                    </div>
                  </OptionCard>
                ))}
              </div>
            )}
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="mt-10 flex items-center gap-3">
        {step > 0 && (
          <Button variant="secondary" size="icon" onClick={() => go(-1)} aria-label="חזרה לשאלה הקודמת">
            <ArrowRight size={18} />
          </Button>
        )}
        <Button className="flex-1 sm:flex-none sm:px-10" disabled={!canContinue} onClick={() => (isLast ? finish() : go(1))}>
          {isLast ? 'זה המסלול שלי' : 'המשך'}
          <ArrowLeft size={18} />
        </Button>
        {question.key === 'trackId' && !answers.trackId && (
          <span className="text-sm text-navy-soft">יש לבחור מסלול כדי להמשיך</span>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="ms-auto" aria-label="ביטול העריכה">
            <X size={16} /> ביטול
          </Button>
        )}
      </div>
    </div>
  );
}
