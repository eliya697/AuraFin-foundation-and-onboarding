import { memo } from 'react';
import { CloudOff, ShieldCheck, Smartphone } from 'lucide-react';
import { hasBackend } from '../../services/api.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

/**
 * One stable verification badge, derived only from how the snapshot was unlocked:
 *   server  → verified by the API.
 *   offline → verified on this device; re-checked in the background (JourneyContext), so it
 *             settles to "verified" by itself instead of flipping between visits.
 * Network loss is shown separately and only while it lasts.
 */
function VerificationBadge({ mode }) {
  const online = useOnlineStatus();

  let badge;
  if (mode === 'server') {
    badge = { icon: ShieldCheck, text: 'הנתונים אומתו', title: 'הנתונים אומתו מול השרת.', className: 'bg-mint/20 text-navy' };
  } else if (!hasBackend) {
    badge = { icon: Smartphone, text: 'ניתוח במכשיר', title: 'הגרסה הזו מנתחת את הנתונים במכשיר שלכם.', className: 'bg-mist text-navy' };
  } else {
    badge = {
      icon: Smartphone,
      text: 'אומת במכשיר · ממתין לשרת',
      title: 'השרת לא היה זמין בזמן האימות. נאמת שוב אוטומטית ברגע שיתאפשר.',
      className: 'bg-amber-50 text-amber-800',
    };
  }
  const Icon = badge.icon;

  return (
    <>
      <span title={badge.title} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${badge.className}`}>
        <Icon size={15} /> {badge.text}
      </span>
      {!online && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-3 py-1.5 text-sm font-semibold text-navy-soft">
          <CloudOff size={15} /> אין חיבור כרגע
        </span>
      )}
    </>
  );
}

export default memo(VerificationBadge);
