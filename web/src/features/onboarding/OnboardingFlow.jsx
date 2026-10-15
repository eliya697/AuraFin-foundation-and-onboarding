import { AnimatePresence, motion } from 'framer-motion';
import { Check, ClipboardList, LayoutDashboard, Lock, Sparkles, UserRound } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import WelcomeScreen from './WelcomeScreen.jsx';
import OnboardingQuiz from './OnboardingQuiz.jsx';
import MandatoryExpenseGate from './MandatoryExpenseGate.jsx';
import { useJourney } from '../../state/JourneyContext.jsx';

const JOURNEY = [
  { stage: 'welcome', label: 'היכרות', icon: Sparkles },
  { stage: 'quiz', label: 'פרופיל ומסלול', icon: UserRound },
  { stage: 'gate', label: 'נתונים חודשיים', icon: ClipboardList },
  { stage: 'dashboard', label: 'דשבורד', icon: LayoutDashboard },
];

const page = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
};

function JourneyStepper({ stage }) {
  const currentIndex = JOURNEY.findIndex((s) => s.stage === stage);
  return (
    <ol className="flex items-center gap-1.5 sm:gap-3" aria-label="התקדמות">
      {JOURNEY.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const locked = s.stage === 'dashboard';
        const Icon = done ? Check : locked ? Lock : s.icon;
        return (
          <li key={s.stage} className="flex items-center gap-1.5 sm:gap-3">
            <span
              aria-current={current ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3.5 sm:text-sm ${
                current
                  ? 'bg-turquoise text-white shadow-[var(--shadow-glow)]'
                  : done
                    ? 'bg-mint/20 text-navy'
                    : 'bg-navy/[0.05] text-navy-soft'
              }`}
            >
              <Icon size={14} />
              <span className={current ? '' : 'hidden sm:inline'}>{s.label}</span>
            </span>
            {i < JOURNEY.length - 1 && <span className="h-px w-3 bg-navy/10 sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Enforces the mandatory journey: Welcome → Quiz → Expense Gate. The stage comes from
 * resolveStage() in the journey model, so there is no way to render a later step early.
 */
export default function OnboardingFlow() {
  const { state, stage, completeWelcome, completeQuiz, reopenQuiz, cancelEdit } = useJourney();
  const editingProfile = state.editing?.kind === 'profile';
  const editingFromDashboard = Boolean(state.editing?.original);

  if (stage === 'welcome') {
    return (
      <motion.div key="welcome" {...page}>
        <WelcomeScreen onStart={completeWelcome} />
      </motion.div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
      {!editingFromDashboard && (
        <header className="mb-5 flex justify-center sm:mb-8 sm:justify-start">
          <JourneyStepper stage={stage} />
        </header>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stage} {...page}>
          <Card padding="p-5 sm:p-10">
            <ErrorBoundary label={`Onboarding ${stage}`} resetKeys={[stage]}>
              {stage === 'quiz' && (
                <OnboardingQuiz
                  initialProfile={state.profile}
                  onComplete={completeQuiz}
                  onCancel={editingProfile && (editingFromDashboard || state.profile) ? cancelEdit : undefined}
                />
              )}
              {stage === 'gate' && <MandatoryExpenseGate />}
            </ErrorBoundary>
          </Card>
          {stage === 'gate' && (
            <p className="mt-4 text-center text-sm text-navy-soft">
              רוצים לשנות מסלול או פרטי משפחה?{' '}
              <button
                type="button"
                onClick={reopenQuiz}
                className="inline-flex min-h-12 items-center font-semibold text-turquoise-dark underline-offset-4 hover:underline"
              >
                עריכת הפרופיל
              </button>
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
