import { Baby, CloudOff, PencilLine, RotateCcw, Target, Wallet, Receipt } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Logo from '../../components/ui/Logo.jsx';
import Reveal from '../../components/ui/Reveal.jsx';
import SavingsGoalMetric from './SavingsGoalMetric.jsx';
import ExpenseDonutChart from './ExpenseDonutChart.jsx';
import AISavingsPlanView from './AISavingsPlanView.jsx';
import { GOALS, LIFE_STAGES } from '../../lib/catalog.js';
import { formatCurrency } from '../../lib/budget.js';
import { useJourney } from '../../state/JourneyContext.jsx';

function Stat({ icon: Icon, label, value, delay }) {
  return (
    <Card initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }} padding="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-navy-soft">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-mist text-turquoise-dark">
          <Icon size={16} />
        </span>
        {label}
      </div>
      <p className="mt-2 text-xl font-extrabold tabular-nums text-navy sm:text-2xl">{value}</p>
    </Card>
  );
}

export default function Dashboard() {
  const { state, reopenGate, restart } = useJourney();
  const analysis = state.unlock.analysis;
  const offline = state.unlock.mode === 'offline';
  const lifeStage = LIFE_STAGES.find((s) => s.id === state.profile.lifeStage);
  const goal = GOALS.find((g) => g.id === state.profile.goal);

  const onRestart = () => {
    if (window.confirm('להתחיל מחדש? כל הנתונים יימחקו מהמכשיר.')) restart();
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-8 sm:pt-8">
      <Reveal as="header" className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Logo size={32} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reopenGate}>
            <PencilLine size={16} /> עדכון נתונים
          </Button>
          <Button variant="ghost" onClick={onRestart} aria-label="התחלה מחדש" size="icon">
            <RotateCcw size={16} />
          </Button>
        </div>
      </Reveal>

      <Reveal delay={0.05} className="mb-8">
        <p className="text-sm font-bold text-turquoise-dark">
          {lifeStage.label} · {goal.label}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{analysis.track_name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.children_count > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-sm font-semibold text-navy">
              <Baby size={15} className="text-turquoise-dark" />
              {analysis.children_count === 1 ? 'ילד אחד' : `${analysis.children_count} ילדים`} · {formatCurrency(analysis.breakdown.children)} בחודש
            </span>
          )}
          {offline && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800"
              title="השרת לא היה זמין, ולכן הנתונים אומתו ונותחו במכשיר שלכם."
            >
              <CloudOff size={15} /> מצב לא מקוון · אומת במכשיר
            </span>
          )}
        </div>
      </Reveal>

      <div className="mb-5 grid grid-cols-3 gap-3 sm:gap-5">
        <Stat icon={Wallet} label="הכנסה" value={formatCurrency(state.budget.income)} delay={0.05} />
        <Stat icon={Receipt} label="הוצאות" value={formatCurrency(analysis.total_expenses)} delay={0.1} />
        <Stat icon={Target} label="יעד חודשי" value={formatCurrency(analysis.savings_goal)} delay={0.15} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <SavingsGoalMetric analysis={analysis} />
        <ExpenseDonutChart breakdown={analysis.breakdown} customItems={state.budget.custom} />
      </div>

      <AISavingsPlanView />
    </div>
  );
}
