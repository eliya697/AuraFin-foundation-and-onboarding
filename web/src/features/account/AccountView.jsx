import { useState } from 'react';
import { CloudCheck, LogOut, PencilLine, RotateCcw, ShieldCheck, UserRoundPen } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Reveal from '../../components/ui/Reveal.jsx';
import SyncBadge from '../../components/SyncBadge.jsx';
import { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { useAuth } from '../../state/AuthContext.jsx';
import { useJourney, useSyncStatus } from '../../state/JourneyContext.jsx';
import { isProfileComplete } from '../../state/journeyModel.js';

const timeFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

export default function AccountView({ onNavigate }) {
  const { user, isAdmin, signOut, backend } = useAuth();
  const { state, stage, startEdit, restart } = useJourney();
  const { lastSyncedAt } = useSyncStatus();
  const [confirm, setConfirm] = useState(null); // 'restart' | 'signout'
  const [busy, setBusy] = useState(false);

  const edit = (kind) => {
    startEdit(kind);
    onNavigate('home');
  };

  const run = async () => {
    setBusy(true);
    try {
      if (confirm === 'restart') {
        restart();
        onNavigate('home');
      } else {
        await signOut();
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
      <Reveal>
        <h1 className="text-3xl font-extrabold tracking-tight text-navy">החשבון שלי</h1>
      </Reveal>

      <Card className="mt-5" padding="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-xl font-extrabold text-white">
            {(user.email[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-navy" dir="ltr">
              {user.email}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {isAdmin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-1 font-bold text-white">
                  <ShieldCheck size={13} /> מנהל מערכת
                </span>
              )}
              <SyncBadge />
            </div>
          </div>
        </div>
        {lastSyncedAt && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-soft">
            <CloudCheck size={14} /> סונכרן לאחרונה: {timeFormat.format(lastSyncedAt)}
          </p>
        )}
      </Card>

      <Card className="mt-4" padding="p-2">
        <ul className="divide-y divide-navy/[0.06]">
          <Row icon={PencilLine} label="עדכון נתונים חודשיים" hint="הכנסה, הוצאות וילדים" disabled={stage !== 'dashboard'} onClick={() => edit('budget')} />
          <Row icon={UserRoundPen} label="עריכת פרופיל ומסלול" hint="שלב בחיים, מטרה, ילדים" disabled={!isProfileComplete(state.profile)} onClick={() => edit('profile')} />
          <Row icon={RotateCcw} label="התחלה מחדש" hint="מחיקת כל נתוני המסע מהחשבון" danger onClick={() => setConfirm('restart')} />
          <Row icon={LogOut} label="התנתקות" onClick={() => setConfirm('signout')} />
        </ul>
      </Card>

      {backend?.kind === 'local' && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">מצב פיתוח מקומי — הנתונים נשמרים בדפדפן הזה בלבד.</p>
      )}

      <ConfirmDialog
        open={confirm === 'restart'}
        title="להתחיל מחדש?"
        description="כל הנתונים — פרופיל, תקציב ותוכנית — יימחקו מהחשבון ומכל המכשירים."
        confirmLabel="כן, למחוק ולהתחיל מחדש"
        danger
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'signout'}
        title="להתנתק?"
        description="הנתונים שמורים בחשבון ויחכו לכם בהתחברות הבאה."
        confirmLabel="התנתקות"
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Row({ icon: Icon, label, hint, onClick, disabled = false, danger = false }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-danger/10 text-danger' : 'bg-mist text-turquoise-dark'}`}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-bold ${danger ? 'text-danger' : 'text-navy'}`}>{label}</span>
          {hint && <span className="block text-xs text-navy-soft">{hint}</span>}
        </span>
      </button>
    </li>
  );
}
