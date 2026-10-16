import { memo, useCallback, useEffect, useState } from 'react';
import { CloudAlert, CloudCheck, CloudOff, Loader2 } from 'lucide-react';
import { useSyncStatus } from '../state/JourneyContext.jsx';
import { useTransactionsSync } from '../state/TransactionsContext.jsx';
import { useGoalsSync } from '../state/GoalsContext.jsx';
import { useHabitsSync } from '../state/HabitsContext.jsx';

const LOOKS = {
  loading: { icon: Loader2, text: 'מסנכרן…', spin: true, className: 'text-navy-soft' },
  saving: { icon: Loader2, text: 'שומר…', spin: true, className: 'text-navy-soft' },
  synced: { icon: CloudCheck, text: 'נשמר', className: 'text-turquoise-dark' },
  offline: { icon: CloudOff, text: 'לא מקוון · נשמר במכשיר', className: 'text-amber-700' },
  error: { icon: CloudAlert, text: 'השמירה נכשלה · נסו שוב', className: 'text-danger' },
};

const SAVING_DELAY_MS = 700;

// When the journey and the outboxes (transactions, goals) disagree, the badge shows the one that matters most.
const PRIORITY = ['error', 'offline', 'saving', 'pending', 'loading', 'synced'];

/** One status for the journey sync and the outboxes ('local' = not synced, ignored). */
export function combineSyncStatus(...sources) {
  const statuses = sources.filter((s) => s && s !== 'local');
  return PRIORITY.find((s) => statuses.includes(s)) ?? 'synced';
}

/** Label with the number of changes waiting for the cloud, e.g. "לא מקוון · 3 ממתינים". */
export function badgeText(shown, pending) {
  const look = LOOKS[shown] ?? LOOKS.synced;
  if (!pending || (shown !== 'offline' && shown !== 'error')) return look.text;
  const count = pending === 1 ? 'שינוי אחד ממתין' : `${pending} ממתינים`;
  return shown === 'offline' ? `לא מקוון · ${count}` : `${look.text} · ${count}`;
}

/**
 * Cloud-sync indicator. Short saves never show a spinner (it only appears if a save takes longer
 * than SAVING_DELAY_MS), so typing doesn't make the badge flicker.
 */
function SyncBadge({ compact = false }) {
  const journey = useSyncStatus();
  const tx = useTransactionsSync();
  const goals = useGoalsSync();
  const habits = useHabitsSync();
  const sources = [journey, tx, goals, habits];
  const cloud = sources.some((s) => s.cloud);
  const status = combineSyncStatus(...sources.map((s) => (s.cloud ? s.status : 'local')));
  const pending = [tx, goals, habits].reduce((sum, s) => sum + (s.cloud ? s.pending : 0), 0);
  const retry = useCallback(() => {
    journey.retry();
    tx.retry();
    goals.retry();
    habits.retry();
  }, [journey, tx, goals, habits]);
  const busy = status === 'pending' || status === 'saving';
  const [shown, setShown] = useState(busy ? 'synced' : status);

  useEffect(() => {
    if (!busy) {
      setShown(status);
      return undefined;
    }
    const timer = setTimeout(() => setShown('saving'), SAVING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, busy]);

  if (!cloud) return null;
  const look = LOOKS[shown] ?? LOOKS.synced;
  const Icon = look.icon;
  const text = badgeText(shown, pending);
  const content = (
    <>
      <Icon size={16} className={look.spin ? 'animate-spin' : ''} aria-hidden="true" />
      {pending > 0 && (shown === 'offline' || shown === 'error') && (
        <span aria-hidden="true" className="tabular-nums sm:hidden">
          {pending}
        </span>
      )}
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{text}</span>
    </>
  );
  const className = `inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold ${look.className}`;

  if (shown === 'error') {
    return (
      <button type="button" onClick={retry} className={className} title="ניסיון שמירה נוסף">
        {content}
      </button>
    );
  }
  return (
    <span role="status" aria-live="polite" className={className} title={text}>
      {content}
    </span>
  );
}

export default memo(SyncBadge);
