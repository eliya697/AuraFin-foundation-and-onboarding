import { memo, useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, PiggyBank, Plus, TrendingUp } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import GoalDialog from './GoalDialog.jsx';
import { formatCurrency, formatPercent } from '../../lib/budget.js';
import { formatMonth } from '../../lib/analytics.js';
import { formatTxDate } from '../../lib/transactions.js';
import { monthlySavings, projectGoal } from '../../lib/goals.js';
import { useGoals } from '../../state/GoalsContext.jsx';
import { useTransactions } from '../../state/TransactionsContext.jsx';

const longDate = (iso) => `${formatTxDate(iso)} ${iso.slice(0, 4)}`;

/** One line explaining the projection; status is carried by icon + text, never colour alone. */
function Projection({ goal, projection }) {
  const { status, projectedMonth, monthsNeeded, neededPerMonth } = projection;
  const when = projectedMonth && `${formatMonth(projectedMonth, 'long')}${monthsNeeded > 1 ? ` (בעוד ${monthsNeeded} חודשים)` : ''}`;
  const views = {
    done: { icon: CheckCircle2, tone: 'text-turquoise-dark', text: () => 'היעד הושג!' },
    on_track: { icon: TrendingUp, tone: 'text-turquoise-dark', text: () => `צפוי להיות מושג ב${when}, לפני תאריך היעד.` },
    no_deadline: { icon: TrendingUp, tone: 'text-navy-soft', text: () => `בקצב הנוכחי: יושג ב${when}.` },
    behind: {
      icon: AlertTriangle,
      tone: 'text-amber-700',
      text: () => `בקצב הנוכחי יושג ב${when}, אחרי תאריך היעד. כדי לעמוד בו: ${formatCurrency(neededPerMonth)} בחודש.`,
    },
    no_pace: {
      icon: AlertTriangle,
      tone: 'text-amber-700',
      text: () => `לא צפוי להסתיים בקצב הנוכחי.${neededPerMonth ? ` כדי לעמוד ביעד: ${formatCurrency(neededPerMonth)} בחודש.` : ''}`,
    },
    overdue: { icon: CalendarClock, tone: 'text-amber-700', text: () => `תאריך היעד (${longDate(goal.deadline)}) עבר. עדכנו תאריך חדש.` },
  };
  const view = views[status];
  const Icon = view.icon;
  return (
    <p className={`mt-2 flex items-start gap-1.5 text-sm font-medium ${view.tone}`}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      {view.text()}
    </p>
  );
}

const GoalCard = memo(function GoalCard({ goal, pace, onOpen }) {
  const projection = useMemo(() => projectGoal(goal, pace), [goal, pace]);
  const done = projection.status === 'done';
  return (
    <li>
      <button type="button" onClick={() => onOpen(goal)} className="w-full rounded-2xl border border-navy/[0.06] p-4 text-start transition-colors hover:bg-mist/60">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-base font-extrabold text-navy">{goal.name}</span>
          {goal.deadline && <span className="shrink-0 text-xs font-semibold text-navy-soft">עד {longDate(goal.deadline)}</span>}
        </div>
        <div
          role="progressbar"
          aria-label={`התקדמות: ${goal.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(projection.progress * 100)}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-mist"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${done ? 'bg-mint' : 'bg-turquoise'}`}
            style={{ width: `${Math.max(projection.progress * 100, goal.saved > 0 ? 2 : 0)}%` }}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
          <span className="tabular-nums text-navy">
            <b>{formatCurrency(goal.saved)}</b> <span className="text-navy-soft">מתוך {formatCurrency(goal.target)}</span>
          </span>
          <span className="font-bold tabular-nums text-navy-soft">{formatPercent(projection.progress)}</span>
        </div>
        <Projection goal={goal} projection={projection} />
      </button>
    </li>
  );
});

/** Savings goals with progress and a projected completion date at the user's monthly savings pace. */
export default function GoalsPanel({ budget, profile }) {
  const { goals, loading, save, remove } = useGoals();
  const { transactions } = useTransactions();
  const pace = useMemo(() => monthlySavings(transactions, { budget, profile }), [transactions, budget, profile]);
  const [dialog, setDialog] = useState({ open: false, goal: null });
  const openNew = useCallback(() => setDialog({ open: true, goal: null }), []);
  const openEdit = useCallback((goal) => setDialog({ open: true, goal }), []);
  const close = useCallback(() => setDialog((d) => ({ ...d, open: false })), []);

  return (
    <Card padding="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy sm:text-xl">יעדי חיסכון</h2>
          <p className="text-sm text-navy-soft">
            קצב החיסכון שלכם: <b className="tabular-nums text-navy">{formatCurrency(pace.amount)}</b> בחודש
            <span className="text-navy-soft/80">
              {' '}
              · {pace.source === 'actual' ? `ממוצע ${pace.months} החודשים האחרונים` : 'לפי התקציב שתכננתם'}
            </span>
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="shrink-0">
          <Plus size={16} /> יעד חדש
        </Button>
      </div>

      {loading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="animate-spin text-turquoise" size={24} aria-label="טוען יעדים" />
        </div>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-mist p-5 text-center text-sm text-navy-soft">
          <PiggyBank size={28} className="text-turquoise-dark" aria-hidden="true" />
          עוד אין יעדים. קרן חירום, טיול או הון עצמי — הגדירו יעד ותראו מתי תגיעו אליו.
        </div>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} pace={pace.amount} onOpen={openEdit} />
            ))}
          </ul>
          {goals.length > 1 && (
            <p className="mt-3 text-xs text-navy-soft">התחזית לכל יעד מניחה שכל החיסכון החודשי הולך אליו, ולכן עם כמה יעדים במקביל היא אופטימית.</p>
          )}
        </>
      )}

      <GoalDialog open={dialog.open} goal={dialog.goal} onSave={save} onDelete={remove} onClose={close} />
    </Card>
  );
}
