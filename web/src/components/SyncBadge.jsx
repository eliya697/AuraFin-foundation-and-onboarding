import { memo, useEffect, useState } from 'react';
import { CloudAlert, CloudCheck, CloudOff, Loader2 } from 'lucide-react';
import { useSyncStatus } from '../state/JourneyContext.jsx';

const LOOKS = {
  loading: { icon: Loader2, text: 'מסנכרן…', spin: true, className: 'text-navy-soft' },
  saving: { icon: Loader2, text: 'שומר…', spin: true, className: 'text-navy-soft' },
  synced: { icon: CloudCheck, text: 'נשמר', className: 'text-turquoise-dark' },
  offline: { icon: CloudOff, text: 'לא מקוון · נשמר במכשיר', className: 'text-amber-700' },
  error: { icon: CloudAlert, text: 'השמירה נכשלה · נסו שוב', className: 'text-danger' },
};

const SAVING_DELAY_MS = 700;

/**
 * Cloud-sync indicator. Short saves never show a spinner (it only appears if a save takes longer
 * than SAVING_DELAY_MS), so typing doesn't make the badge flicker.
 */
function SyncBadge({ compact = false }) {
  const { status, retry, cloud } = useSyncStatus();
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
  const content = (
    <>
      <Icon size={16} className={look.spin ? 'animate-spin' : ''} aria-hidden="true" />
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{look.text}</span>
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
    <span role="status" aria-live="polite" className={className} title={look.text}>
      {content}
    </span>
  );
}

export default memo(SyncBadge);
