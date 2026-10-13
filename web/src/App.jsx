import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import OnboardingFlow from './features/onboarding/OnboardingFlow.jsx';
import { useAppState } from './state/AppStateContext.jsx';

const Dashboard = lazy(() => import('./features/dashboard/Dashboard.jsx'));

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader2 className="animate-spin text-growth" size={32} aria-label="טוען" />
    </div>
  );
}

const page = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 26 } },
  exit: { opacity: 0, y: -24, scale: 0.98, transition: { duration: 0.25 } },
};

function ErrorToast() {
  const { status, error, clearError } = useAppState();
  return (
    <AnimatePresence>
      {error && status !== 'error' && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-rose-500/30 bg-ink/95 p-4 text-sm text-rose-200 shadow-2xl backdrop-blur"
        >
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button type="button" onClick={clearError} aria-label="סגירה" className="text-rose-300 hover:text-white">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const { status, error } = useAppState();

  return (
    <>
      <AnimatePresence mode="wait">
        {status === 'booting' && (
          <motion.div key="boot" {...page}>
            <FullScreenSpinner />
          </motion.div>
        )}
        {status === 'error' && (
          <motion.div key="error" {...page} className="grid min-h-dvh place-items-center px-4">
            <div className="max-w-md rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
              <TriangleAlert className="mx-auto text-rose-300" size={28} />
              <p className="mt-3 font-semibold text-white">לא הצלחנו להתחבר</p>
              <p className="mt-1 text-sm text-rose-200">{error}</p>
            </div>
          </motion.div>
        )}
        {status === 'onboarding' && (
          <motion.main key="onboarding" {...page}>
            <OnboardingFlow />
          </motion.main>
        )}
        {status === 'ready' && (
          <motion.main key="dashboard" {...page}>
            <Suspense fallback={<FullScreenSpinner />}>
              <Dashboard />
            </Suspense>
          </motion.main>
        )}
      </AnimatePresence>
      <ErrorToast />
    </>
  );
}
