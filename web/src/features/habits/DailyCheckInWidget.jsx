import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Check, Flame, Plus, Trophy } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import TransactionDialog from '../transactions/TransactionDialog.jsx';
import {
  BADGES,
  TASKS,
  XP,
  dailyAllowance,
  earnedBadges,
  emptyTasks,
  experience,
  feedbackBadges,
  noSpendStreak,
} from '../../lib/habits.js';
import { budgetLines, todayISO } from '../../lib/transactions.js';
import { useHabits } from '../../state/HabitsContext.jsx';
import { useTransactions } from '../../state/TransactionsContext.jsx';
import { useMoney } from '../../state/privacy.js';

const longDate = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

/** Today's date, refreshed when the app returns to the foreground and at midnight. */
function useToday() {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5) - now;
    const timer = setTimeout(refresh, midnight);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [today]);
  return today;
}

const haptic = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* not supported */
  }
};

/**
 * Daily engagement on the dashboard: "did you spend money today?" (a "no" builds the no-spend
 * streak), three micro-tasks, XP / level, streak badges, and today's safe-to-spend allowance.
 * Logic: lib/habits.js. Renders nothing outside a HabitsProvider.
 */
export default function DailyCheckInWidget({ budget, profile, savingsGoal, onReviewTransactions }) {
  const habits = useHabits();
  if (!habits) return null;
  return <CheckIn habits={habits} budget={budget} profile={profile} savingsGoal={savingsGoal} onReviewTransactions={onReviewTransactions} />;
}

function CheckIn({ habits, budget, profile, savingsGoal, onReviewTransactions }) {
  const money = useMoney();
  const today = useToday();
  const { transactions, save } = useTransactions();
  const { logs, byDate, checkIn } = habits;
  const lines = useMemo(() => budgetLines(budget, profile), [budget, profile]);
  const [adding, setAdding] = useState(false);
  const [gain, setGain] = useState(null); // { id, xp } floating "+XP"
  const gainTimer = useRef(0);
  useEffect(() => () => clearTimeout(gainTimer.current), []);

  const log = byDate.get(today) ?? { noSpend: null, tasks: emptyTasks() };
  const todays = useMemo(() => transactions.filter((tx) => tx.occurredOn === today && tx.kind === 'expense'), [transactions, today]);
  const spentToday = todays.length > 0;
  const loggedManually = todays.some((tx) => tx.source === 'manual');

  const streak = useMemo(() => noSpendStreak(logs, transactions, today), [logs, transactions, today]);
  const level = useMemo(() => experience(logs, transactions), [logs, transactions]);
  const allowance = useMemo(
    () => dailyAllowance({ budget, profile, lines, transactions, savingsGoal, today }),
    [budget, profile, lines, transactions, savingsGoal, today],
  );
  const badges = useMemo(() => feedbackBadges({ streak, allowance }), [streak, allowance]);
  const earned = earnedBadges(streak.best);
  const nextBadge = BADGES.find((badge) => streak.best < badge.days);

  const celebrate = useCallback((xp) => {
    haptic();
    clearTimeout(gainTimer.current);
    setGain({ id: Date.now(), xp });
    gainTimer.current = setTimeout(() => setGain(null), 1400);
  }, []);

  const answer = async (noSpend) => {
    await checkIn({ noSpend });
    if (noSpend) celebrate(XP.noSpend + (log.noSpend === null ? XP.checkIn : 0));
    else if (log.noSpend === null) celebrate(XP.checkIn);
  };

  const toggleTask = async (id, done) => {
    await checkIn({ tasks: { [id]: done } });
    if (done) {
      const completed = TASKS.every((task) => task.id === id || log.tasks[task.id] || (task.id === 'cash' && loggedManually));
      celebrate(XP.task + (completed ? XP.allTasks : 0));
    }
  };

  const taskDone = (id) => Boolean(log.tasks[id]) || (id === 'cash' && loggedManually);
  const doneCount = TASKS.filter((task) => taskDone(task.id)).length;

  return (
    <Card padding="p-4 sm:p-6" className="relative overflow-hidden" aria-labelledby="daily-checkin-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="daily-checkin-title" className="flex items-center gap-2 text-lg font-extrabold text-navy sm:text-xl">
            <CalendarCheck size={20} className="text-turquoise-dark" aria-hidden="true" /> הצ׳ק-אין היומי
          </h2>
          <p className="text-sm text-navy-soft">{longDate.format(new Date(`${today}T12:00:00`))}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums ${
              streak.current > 0 ? 'bg-amber-50 text-amber-700' : 'bg-mist text-navy-soft'
            }`}
            aria-label={`רצף של ${streak.current} ימים בלי הוצאות`}
          >
            <Flame size={15} aria-hidden="true" /> {streak.current}
          </span>
          <LevelPill level={level} />
        </div>
      </div>

      {badges.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="סטטוס היום">
          {badges.map((badge) => (
            <li
              key={badge.text}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${badge.tone === 'good' ? 'bg-turquoise/10 text-turquoise-dark' : 'bg-amber-50 text-amber-700'}`}
            >
              {badge.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AllowanceMeter allowance={allowance} money={money} />

        <div className="space-y-4">
          <NoSpendQuestion
            answered={log.noSpend}
            spentToday={spentToday}
            spentCount={todays.length}
            onAnswer={answer}
            onAddExpense={() => setAdding(true)}
          />

          <div>
            <p className="mb-1.5 flex items-center justify-between text-xs font-bold text-navy-soft">
              <span>משימות קטנות להיום</span>
              <span className="tabular-nums">
                {doneCount}/{TASKS.length}
              </span>
            </p>
            <ul className="space-y-1.5">
              {TASKS.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  done={taskDone(task.id)}
                  locked={task.id === 'cash' && loggedManually}
                  onToggle={(done) => toggleTask(task.id, done)}
                  action={
                    task.id === 'review'
                      ? onReviewTransactions && { label: 'לתנועות', onClick: onReviewTransactions }
                      : task.id === 'cash'
                        ? { label: 'הוספה', icon: Plus, onClick: () => setAdding(true) }
                        : null
                  }
                />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-soft">
        <span className="inline-flex items-center gap-1">
          <Trophy size={13} aria-hidden="true" /> השיא: {streak.best} ימים
        </span>
        {earned.length > 0 && (
          <span aria-label="תגים שהושגו">
            {earned.map((badge) => (
              <span key={badge.id} title={badge.label} className="me-0.5">
                {badge.emoji}
              </span>
            ))}
          </span>
        )}
        {nextBadge && (
          <span>
            התג הבא: {nextBadge.emoji} {nextBadge.label} (עוד {nextBadge.days - streak.best})
          </span>
        )}
      </p>

      <AnimatePresence>
        {gain && (
          <motion.span
            key={gain.id}
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="gpu pointer-events-none absolute end-4 top-4 rounded-full bg-mint px-3 py-1 text-sm font-extrabold text-navy-deep shadow-[var(--shadow-glow)]"
          >
            +{gain.xp} XP
          </motion.span>
        )}
      </AnimatePresence>

      <TransactionDialog open={adding} transaction={null} lines={lines} onSave={save} onClose={() => setAdding(false)} />
    </Card>
  );
}

const LevelPill = memo(function LevelPill({ level }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-navy" title={`${level.xp} XP · עוד ${level.toNext} לרמה הבאה`}>
      רמה {level.level}
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-navy/10" aria-hidden="true">
        <span className="block h-full origin-left rounded-full bg-turquoise transition-transform duration-500 rtl:origin-right" style={{ transform: `scaleX(${level.progress})` }} />
      </span>
      <span className="sr-only">
        {level.xp} נקודות ניסיון, עוד {level.toNext} לרמה הבאה
      </span>
    </span>
  );
});

const STATUS_STYLES = {
  ok: { bar: 'bg-turquoise', text: 'text-turquoise-dark', note: 'אתם בתוך התקציב היומי.' },
  tight: { bar: 'bg-amber-500', text: 'text-amber-700', note: 'נשאר פחות מהרגיל עד סוף החודש.' },
  over: { bar: 'bg-danger', text: 'text-danger', note: 'עברתם את הסכום להיום. מחר מתחילים מחדש.' },
  empty: { bar: 'bg-danger', text: 'text-danger', note: 'התקציב הגמיש לחודש הזה נגמר.' },
};

const AllowanceMeter = memo(function AllowanceMeter({ allowance, money }) {
  const style = STATUS_STYLES[allowance.status];
  const used = allowance.allowance > 0 ? Math.min(1, allowance.spentToday / allowance.allowance) : allowance.spentToday > 0 ? 1 : 0;
  return (
    <section aria-labelledby="allowance-title" className="rounded-[24px] bg-mist p-4">
      <p id="allowance-title" className="text-sm font-bold text-navy-soft">
        מותר להוציא היום
      </p>
      <p className={`mt-1 text-4xl font-extrabold tabular-nums tracking-tight ${style.text}`}>{money(Math.max(0, allowance.remainingToday))}</p>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-navy/10"
        role="progressbar"
        aria-label="ניצול הסכום היומי"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used * 100)}
      >
        <div className={`gpu h-full origin-left rounded-full ${style.bar} transition-transform duration-500 rtl:origin-right`} style={{ transform: `scaleX(${used})` }} />
      </div>
      <p className="mt-2 text-xs text-navy-soft">
        הוצאתם היום {money(allowance.spentToday)} מתוך {money(allowance.allowance)} · ממוצע יומי {money(allowance.dailyAverage)} · עוד {allowance.daysLeft}{' '}
        {allowance.daysLeft === 1 ? 'יום' : 'ימים'} בחודש
      </p>
      <p className={`mt-1 text-xs font-semibold ${style.text}`}>{style.note}</p>
    </section>
  );
});

function NoSpendQuestion({ answered, spentToday, spentCount, onAnswer, onAddExpense }) {
  const [busy, setBusy] = useState(false);
  const run = async (noSpend) => {
    setBusy(true);
    try {
      await onAnswer(noSpend);
    } finally {
      setBusy(false);
    }
  };

  if (spentToday) {
    return (
      <div className="rounded-2xl border border-navy/[0.06] p-3 text-sm text-navy-soft">
        רשמתם היום {spentCount === 1 ? 'הוצאה אחת' : `${spentCount} הוצאות`}, אז היום לא נספר כיום בלי הוצאות. מחר הזדמנות חדשה 💪
      </div>
    );
  }
  if (answered === true) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-turquoise/10 p-3">
        <p className="flex items-center gap-2 text-sm font-bold text-turquoise-dark">
          <Check size={18} aria-hidden="true" /> יום בלי הוצאות! כל הכבוד
        </p>
        <Button variant="ghost" size="sm" onClick={() => run(false)} disabled={busy}>
          בעצם הוצאתי
        </Button>
      </div>
    );
  }
  if (answered === false) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy/[0.06] p-3">
        <p className="text-sm text-navy-soft">תודה על הכנות. רשמו את ההוצאה כדי שהתקציב יישאר מדויק.</p>
        <Button size="sm" onClick={onAddExpense}>
          <Plus size={16} /> רישום הוצאה
        </Button>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 font-bold text-navy">הוצאתם כסף היום?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => run(true)} disabled={busy}>
          לא, יום בלי הוצאות
        </Button>
        <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
          כן
        </Button>
      </div>
    </div>
  );
}

function TaskRow({ task, done, locked, onToggle, action }) {
  const Icon = action?.icon;
  return (
    <li className="flex items-center gap-2">
      <label className={`flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm transition-colors ${done ? 'text-navy-soft' : 'text-navy hover:bg-mist'}`}>
        <input
          type="checkbox"
          checked={done}
          disabled={locked}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--color-turquoise)]"
        />
        <span className={done ? 'line-through decoration-navy/30' : 'font-semibold'}>{task.label}</span>
      </label>
      {action && !done && (
        <button type="button" onClick={action.onClick} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-turquoise-dark hover:bg-mist">
          {Icon && <Icon size={14} aria-hidden="true" />} {action.label}
        </button>
      )}
    </li>
  );
}
