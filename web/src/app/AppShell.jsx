import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { House, PencilLine, ShieldCheck, UserRound } from 'lucide-react';
import Logo from '../components/ui/Logo.jsx';
import SyncBadge from '../components/SyncBadge.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import Spinner from '../components/Spinner.jsx';
import OnboardingFlow from '../features/onboarding/OnboardingFlow.jsx';
import { useAuth } from '../state/AuthContext.jsx';
import { useJourney } from '../state/JourneyContext.jsx';
import { BACK_PRIORITY, useBackHandler } from '../hooks/useBackHandler.js';

const Dashboard = lazy(() => import('../features/dashboard/Dashboard.jsx'));
const AccountView = lazy(() => import('../features/account/AccountView.jsx'));
const AdminPanel = lazy(() => import('../features/admin/AdminPanel.jsx'));

/** Mobile bottom bar + desktop header nav. `view` is the app's only routing state. */
export default function AppShell() {
  const { isAdmin } = useAuth();
  const { stage, state, startEdit } = useJourney();
  const [view, setView] = useState('home'); // 'home' | 'account' | 'admin'
  const editing = Boolean(state.editing);

  const go = useCallback((next) => {
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  // Back from account/admin returns home; at home the next layer (steps, exit prompt) decides.
  useBackHandler(() => go('home'), { enabled: view !== 'home', priority: BACK_PRIORITY.screen });

  // Lets fixed overlays (toasts, install banner) sit above the bottom bar (see index.css).
  useEffect(() => {
    document.documentElement.dataset.bottomNav = '';
    return () => delete document.documentElement.dataset.bottomNav;
  }, []);

  // An admin who loses the role while on the panel is sent home.
  useEffect(() => {
    if (view === 'admin' && !isAdmin) setView('home');
  }, [view, isAdmin]);

  const items = useMemo(
    () => [
      { key: 'home', label: 'בית', icon: House, onSelect: () => go('home'), active: view === 'home' && !editing },
      {
        key: 'update',
        label: 'עדכון נתונים',
        short: 'עדכון',
        icon: PencilLine,
        disabled: stage !== 'dashboard' && !editing,
        onSelect: () => {
          if (stage === 'dashboard') startEdit('budget');
          go('home');
        },
        active: view === 'home' && editing,
      },
      { key: 'account', label: 'החשבון שלי', short: 'חשבון', icon: UserRound, onSelect: () => go('account'), active: view === 'account' },
      ...(isAdmin
        ? [{ key: 'admin', label: 'ניהול מערכת', short: 'ניהול', icon: ShieldCheck, onSelect: () => go('admin'), active: view === 'admin' }]
        : []),
    ],
    [view, editing, stage, isAdmin, go, startEdit],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="gpu sticky top-0 z-40 border-b border-navy/[0.06] bg-white/[0.97] pt-[env(safe-area-inset-top)] safe-x">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          <button type="button" onClick={() => go('home')} className="-ms-1 flex min-h-12 items-center rounded-xl px-1" aria-label="AuraFin — מסך הבית">
            <Logo size={28} />
          </button>
          <nav aria-label="ניווט ראשי" className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavButton key={item.key} item={item} variant="top" />
            ))}
          </nav>
          <SyncBadge compact />
        </div>
      </header>

      <main className="flex-1 pb-[calc(var(--app-bottom-inset)+env(safe-area-inset-bottom))] safe-x md:pb-[env(safe-area-inset-bottom)]">
        <ErrorBoundary label={`View ${view}`} resetKeys={[view, stage]}>
          <Suspense fallback={<Spinner />}>
            {view === 'home' && <JourneyStage stage={stage} />}
            {view === 'account' && <AccountView onNavigate={go} />}
            {view === 'admin' && isAdmin && <AdminPanel />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <nav
        aria-label="ניווט ראשי"
        className="gpu fixed inset-x-0 bottom-0 z-40 border-t border-navy/[0.08] bg-white pb-[env(safe-area-inset-bottom)] safe-x md:hidden"
      >
        <ul className="mx-auto flex h-[var(--bottom-nav-h)] max-w-md items-stretch justify-around px-2">
          {items.map((item) => (
            <li key={item.key} className="flex flex-1">
              <NavButton item={item} variant="bottom" />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavButton({ item, variant }) {
  const Icon = item.icon;
  if (variant === 'top') {
    return (
      <button
        type="button"
        onClick={item.onSelect}
        disabled={item.disabled}
        aria-current={item.active ? 'page' : undefined}
        className={`inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
          item.active ? 'bg-turquoise/10 text-turquoise-dark' : 'text-navy-soft hover:bg-mist hover:text-navy'
        }`}
      >
        <Icon size={17} /> {item.label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={item.onSelect}
      disabled={item.disabled}
      aria-current={item.active ? 'page' : undefined}
      aria-label={item.label}
      className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition-colors disabled:opacity-35 ${
        item.active ? 'text-turquoise-dark' : 'text-navy-soft active:bg-mist'
      }`}
    >
      <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${item.active ? 'bg-turquoise/12' : ''}`}>
        <Icon size={20} strokeWidth={item.active ? 2.4 : 2} />
      </span>
      {item.short ?? item.label}
    </button>
  );
}

function JourneyStage({ stage }) {
  const unlocked = stage === 'dashboard';

  // New stage → start at the top (e.g. after unlocking the dashboard from the gate's last step).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [unlocked]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {unlocked ? (
        <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          <ErrorBoundary label="Dashboard">
            <Suspense fallback={<Spinner />}>
              <Dashboard />
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      ) : (
        <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}>
          <ErrorBoundary label="Onboarding">
            <OnboardingFlow />
          </ErrorBoundary>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
