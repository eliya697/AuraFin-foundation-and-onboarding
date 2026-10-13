import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Target } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import OptionCard from '../../components/ui/OptionCard.jsx';
import { GOALS, LIFE_STAGES, recommendTracks } from '../../lib/catalog.js';
import { formatPercent } from '../../lib/budget.js';

const QUESTIONS = [
  { key: 'lifeStage', eyebrow: 'שאלה 1 מתוך 2', title: 'מי אתם?', subtitle: 'נתאים את הרף לשלב בחיים שלכם.' },
  { key: 'goal', eyebrow: 'שאלה 2 מתוך 2', title: 'מה המטרה העיקרית?', subtitle: 'אפשר לשנות בהמשך. בחרו את מה שהכי בוער.' },
  { key: 'trackId', eyebrow: 'המסלול שלכם', title: 'בחרו מסלול', subtitle: 'לפי התשובות שלכם, זה המסלול שאנחנו ממליצים עליו.' },
];

const AUTO_ADVANCE_MS = 320;

const slide = {
  enter: (dir) => ({ opacity: 0, y: 24, x: dir > 0 ? -24 : 24 }),
  center: { opacity: 1, y: 0, x: 0 },
  exit: (dir) => ({ opacity: 0, y: -12, x: dir > 0 ? 24 : -24 }),
};

export default function OnboardingQuiz({ initialProfile, onComplete }) {
  const [answers, setAnswers] = useState({
    lifeStage: initialProfile?.lifeStage ?? null,
    goal: initialProfile?.goal ?? null,
    trackId: initialProfile?.trackId ?? null,
  });
  const [[step, direction], setStep] = useState([0, 1]);
  const question = QUESTIONS[step];

  const go = (delta) => setStep(([current]) => [current + delta, delta]);

  const answer = (key, value) => {
    setAnswers((prev) => ({
      ...prev,
      [key]: value,
      // Changing the profile invalidates a previously chosen track.
      ...(key !== 'trackId' && prev[key] !== value ? { trackId: null } : {}),
    }));
    if (key !== 'trackId') {
      const from = step;
      // Advance only if still on the same question (guards against double taps).
      setTimeout(() => setStep(([current, dir]) => (current === from ? [current + 1, 1] : [current, dir])), AUTO_ADVANCE_MS);
    }
  };

  const tracks = answers.lifeStage && answers.goal ? recommendTracks(answers.lifeStage, answers.goal) : [];
  const canContinue = Boolean(answers[question.key]);

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
          <Button variant="secondary" onClick={() => go(-1)} aria-label="חזרה לשאלה הקודמת">
            <ArrowRight size={18} />
          </Button>
        )}
        <Button
          className="flex-1 sm:flex-none sm:px-10"
          disabled={!canContinue}
          onClick={() => (step < QUESTIONS.length - 1 ? go(1) : onComplete(answers))}
        >
          {step < QUESTIONS.length - 1 ? 'המשך' : 'זה המסלול שלי'}
          <ArrowLeft size={18} />
        </Button>
        {question.key === 'trackId' && !answers.trackId && (
          <span className="text-sm text-navy-soft">יש לבחור מסלול כדי להמשיך</span>
        )}
      </div>
    </div>
  );
}
