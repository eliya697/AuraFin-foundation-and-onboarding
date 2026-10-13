import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import OnboardingFlow from './features/onboarding/OnboardingFlow.jsx';
import UpdateNotification from './components/UpdateNotification.jsx';
import { useJourney } from './state/JourneyContext.jsx';

const Dashboard = lazy(() => import('./features/dashboard/Dashboard.jsx'));

function Spinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader2 className="animate-spin text-turquoise" size={32} aria-label="טוען" />
    </div>
  );
}

export default function App() {
  const { stage } = useJourney();
  const unlocked = stage === 'dashboard';

  return (
    <>
      <AnimatePresence mode="wait">
        {unlocked ? (
          <motion.main key="dashboard" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Suspense fallback={<Spinner />}>
              <Dashboard />
            </Suspense>
          </motion.main>
        ) : (
          <motion.main key="onboarding" exit={{ opacity: 0, y: -16 }}>
            <OnboardingFlow />
          </motion.main>
        )}
      </AnimatePresence>
      {/* Global: rendered outside the stage switch so it persists across every screen. */}
      <UpdateNotification />
    </>
  );
}
