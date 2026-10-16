import { lazy, memo, Suspense, useCallback } from 'react';
import { Baby, PencilLine, Receipt, Target, UserRoundPen, Wallet } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Reveal from '../../components/ui/Reveal.jsx';
import ErrorBoundary, { ErrorFallback } from '../../components/ErrorBoundary.jsx';
import SavingsGoalMetric from './SavingsGoalMetric.jsx';
import AISavingsPlanView from './AISavingsPlanView.jsx';
import VerificationBadge from './VerificationBadge.jsx';
import TransactionsPanel from '../transactions/TransactionsPanel.jsx';
import GoalsPanel from '../goals/GoalsPanel.jsx';
import DailyCheckInWidget from '../habits/DailyCheckInWidget.jsx';
import { GOALS, LIFE_STAGES } from '../../lib/catalog.js';
import { useJourney } from '../../state/JourneyContext.jsx';
import { useLastDefined } from '../../hooks/useLastDefined.js';
import { useMoney } from '../../state/privacy.js';

// Charts (Recharts, ~350 kB) load in their own chunk, in parallel with the first dashboard paint.
const ExpenseDonutChart = lazy(() => import('./ExpenseDonutChart.jsx'));
const AnalyticsPanel = lazy(() => import('../analytics/AnalyticsPanel.jsx'));

const chartSkeleton = <div className="min-h-[22rem] animate-pulse rounded-[28px] bg-mist" aria-label="טוען תרשים" />;

const Stat = memo(function Stat({ icon: Icon, label, value, delay }) {
  return (
    <Card initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }} padding="p-3.5 sm:p-5">
      <div className="flex items-center gap-2 text-xs text-navy-soft sm:text-sm">
        <span className="hidden h-8 w-8 place-items-center rounded-xl bg-mist text-turquoise-dark min-[380px]:grid">
          <Icon size={16} />
        </span>
        {label}
      </div>
      <p className="mt-2 truncate text-lg font-extrabold tabular-nums text-navy sm:text-2xl">{value}</p>
    </Card>
  );
});

const sectionFallback = (error, reset) => <ErrorFallback onRetry={reset} title="לא הצלחנו להציג את החלק הזה" />;

export default function Dashboard() {
  const money = useMoney();
  const { state, startEdit, updateBudget } = useJourney();
  // While "עדכון נתונים" animates this screen out, the live unlock/profile can already be gone.
  // Render that last frame from the previous values instead of throwing (the old white screen).
  const view = useLastDefined(state.unlock && state.profile ? state : null);

  // A budget suggested by a statement import opens the gate pre-filled, so it is checked and re-verified.
  const applyBudget = useCallback(
    (budget) => {
      startEdit('budget');
      updateBudget(budget);
    },
    [startEdit, updateBudget],
  );
  const reviewTransactions = useCallback(() => {
    document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!view) return null;

  const { analysis } = view.unlock;
  const lifeStage = LIFE_STAGES.find((s) => s.id === view.profile.lifeStage);
  const goal = GOALS.find((g) => g.id === view.profile.goal);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div className="min-w-0">
          <p className="text-sm font-bold text-turquoise-dark">
            {[lifeStage?.label, goal?.label].filter(Boolean).join(' · ')}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{analysis.track_name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {analysis.children_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-sm font-semibold text-navy">
                <Baby size={15} className="text-turquoise-dark" />
                {analysis.children_count === 1 ? 'ילד אחד' : `${analysis.children_count} ילדים`} ·{' '}
                {money(analysis.breakdown?.children)} בחודש
              </span>
            )}
            <VerificationBadge mode={view.unlock.mode} />
          </div>
        </div>
        {/* Phones reach these from the bottom bar. */}
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="secondary" size="sm" onClick={() => startEdit('profile')}>
            <UserRoundPen size={16} /> עריכת פרופיל
          </Button>
          <Button size="sm" onClick={() => startEdit('budget')}>
            <PencilLine size={16} /> עדכון נתונים
          </Button>
        </div>
      </Reveal>

      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:gap-5">
        <Stat icon={Wallet} label="הכנסה" value={money(view.budget.income)} delay={0.05} />
        <Stat icon={Receipt} label="הוצאות" value={money(analysis.total_expenses)} delay={0.1} />
        <Stat icon={Target} label="יעד חודשי" value={money(analysis.savings_goal)} delay={0.15} />
      </div>

      <div className="mb-5">
        <ErrorBoundary label="Daily check-in" fallback={sectionFallback}>
          <DailyCheckInWidget
            budget={view.budget}
            profile={view.profile}
            savingsGoal={analysis.savings_goal}
            onReviewTransactions={reviewTransactions}
          />
        </ErrorBoundary>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <ErrorBoundary label="Savings goal" fallback={sectionFallback} resetKeys={[analysis]}>
          <SavingsGoalMetric analysis={analysis} />
        </ErrorBoundary>
        <ErrorBoundary label="Expense chart" fallback={sectionFallback} resetKeys={[analysis]}>
          <Suspense fallback={chartSkeleton}>
            <ExpenseDonutChart breakdown={analysis.breakdown} customItems={view.budget.custom} />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div id="transactions" className="mb-5">
        <ErrorBoundary label="Transactions" fallback={sectionFallback}>
          <TransactionsPanel budget={view.budget} profile={view.profile} onApplyBudget={applyBudget} />
        </ErrorBoundary>
      </div>

      <div className="cv-section mb-5">
        <ErrorBoundary label="Savings goals" fallback={sectionFallback}>
          <GoalsPanel budget={view.budget} profile={view.profile} />
        </ErrorBoundary>
      </div>

      <div className="cv-section mb-5">
        <ErrorBoundary label="Analytics" fallback={sectionFallback}>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[28px] bg-mist" aria-label="טוען ניתוח" />}>
            <AnalyticsPanel budget={view.budget} profile={view.profile} />
          </Suspense>
        </ErrorBoundary>
      </div>

      <ErrorBoundary label="Savings plan" fallback={sectionFallback} resetKeys={[view.unlock.fingerprint]}>
        <AISavingsPlanView />
      </ErrorBoundary>
    </div>
  );
}
