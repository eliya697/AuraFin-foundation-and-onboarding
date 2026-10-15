import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Ban, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck, ShieldOff, UserCheck, Users } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Reveal from '../../components/ui/Reveal.jsx';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { useAuth } from '../../state/AuthContext.jsx';
import { normalizeJourney, resolveStage } from '../../state/journeyModel.js';
import { GOALS, LIFE_STAGES, TRACKS } from '../../lib/catalog.js';
import { previewTotals } from '../../lib/budget.js';
import { useMoney } from '../../state/privacy.js';

const STAGES = {
  welcome: { label: 'היכרות', className: 'bg-navy/[0.06] text-navy-soft' },
  quiz: { label: 'שאלון', className: 'bg-navy/[0.06] text-navy-soft' },
  gate: { label: 'נתונים', className: 'bg-amber-50 text-amber-800' },
  dashboard: { label: 'דשבורד', className: 'bg-mint/20 text-navy' },
};
const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '—');

/** System administration: every user, their journey and role/suspension controls. Admins only. */
export default function AdminPanel() {
  const { backend, user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await backend.admin.listUsers());
    } catch (err) {
      setError(err?.message ?? 'טעינת המשתמשים נכשלה.');
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q));
  }, [users, deferredQuery]);

  const stats = useMemo(() => {
    const list = users ?? [];
    return [
      { label: 'משתמשים', value: list.length },
      { label: 'השלימו מסע', value: list.filter((u) => u.stage === 'dashboard').length },
      { label: 'מנהלים', value: list.filter((u) => u.role === 'admin').length },
      { label: 'מושעים', value: list.filter((u) => u.suspended).length },
    ];
  }, [users]);

  const selected = users?.find((u) => u.id === selectedId) ?? null;
  const onSelect = useCallback((id) => setSelectedId(id), []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
      <Reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-turquoise-dark">
            <ShieldCheck size={16} /> ניהול מערכת
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy">משתמשים</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> רענון
        </Button>
      </Reveal>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
        {stats.map((s) => (
          <Card key={s.label} padding="p-4">
            <p className="text-xs text-navy-soft">{s.label}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-navy">{users ? s.value : '—'}</p>
          </Card>
        ))}
      </div>

      <label className="mt-5 flex min-h-12 items-center gap-2 rounded-2xl border-2 border-navy/10 bg-surface px-4 focus-within:border-turquoise">
        <Search size={18} className="shrink-0 text-navy/40" />
        <span className="sr-only">חיפוש לפי אימייל</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי אימייל"
          dir="auto"
          className="min-h-12 w-full bg-transparent text-base outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/25 bg-danger/[0.05] p-4 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {loading && !users ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="animate-spin text-turquoise" size={28} aria-label="טוען" />
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} isMe={u.id === me.id} onSelect={onSelect} />
          ))}
          {users && filtered.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-12 text-navy-soft">
              <Users size={28} /> אין משתמשים תואמים
            </li>
          )}
        </ul>
      )}

      <UserDetails user={selected} isMe={selected?.id === me.id} onClose={() => setSelectedId(null)} onChanged={load} />
    </div>
  );
}

const UserRow = memo(function UserRow({ user, isMe, onSelect }) {
  const money = useMoney();
  const stage = STAGES[user.stage];
  return (
    <li className="cv-row">
      <button
        type="button"
        onClick={() => onSelect(user.id)}
        className="flex min-h-16 w-full items-center gap-3 rounded-3xl border border-navy/[0.07] bg-surface p-3.5 text-start shadow-[var(--shadow-soft)] transition-colors hover:border-turquoise/40"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mist font-extrabold text-turquoise-dark">
          {(user.email[0] ?? '?').toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-navy" dir="ltr">
            {user.email}
            {isMe && <span className="ms-1 text-xs font-semibold text-navy-soft">(אתם)</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {user.role === 'admin' && <span className="rounded-full bg-navy px-2 py-0.5 font-bold text-surface">מנהל</span>}
            {user.suspended && <span className="rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">מושעה</span>}
            {!user.emailConfirmed && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-800">לא אומת</span>}
            <span className={`rounded-full px-2 py-0.5 font-semibold ${stage?.className ?? 'bg-navy/[0.06] text-navy-soft'}`}>
              {stage?.label ?? 'טרם התחיל'}
            </span>
            {user.trackId && TRACKS[user.trackId] && <span className="text-navy-soft">{TRACKS[user.trackId].name}</span>}
          </span>
        </span>
        <span className="hidden shrink-0 text-end text-xs text-navy-soft sm:block">
          <span className="block font-bold tabular-nums text-navy">{user.income === null ? '—' : money(user.income)}</span>
          עודכן {formatDate(user.journeyUpdatedAt)}
        </span>
      </button>
    </li>
  );
});

function UserDetails({ user, isMe, onClose, onChanged }) {
  const money = useMoney();
  const { backend } = useAuth();
  const [journey, setJourney] = useState(undefined); // undefined = loading, null = none
  const [confirm, setConfirm] = useState(null); // { action, title, description, danger, label }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setJourney(undefined);
    setError(null);
    backend.admin
      .getJourney(userId)
      .then((row) => !cancelled && setJourney(row?.state ? normalizeJourney(row.state) : null))
      .catch((err) => !cancelled && (setJourney(null), setError(err?.message ?? 'טעינת הנתונים נכשלה.')));
    return () => {
      cancelled = true;
    };
  }, [backend, userId]);

  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirm.action();
      setConfirm(null);
      await onChanged();
      if (confirm.closeAfter) onClose();
    } catch (err) {
      setError(err?.message ?? 'הפעולה נכשלה.');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => {
    if (!journey) return null;
    const lifeStage = LIFE_STAGES.find((s) => s.id === journey.profile?.lifeStage)?.label;
    const goal = GOALS.find((g) => g.id === journey.profile?.goal)?.label;
    const track = TRACKS[journey.profile?.trackId]?.name;
    const totals = journey.profile ? previewTotals(journey.budget, journey.profile) : null;
    return { lifeStage, goal, track, totals, stage: resolveStage(journey) };
  }, [journey]);

  return (
    <>
      <Dialog open={Boolean(user) && !confirm} onClose={onClose} title={user?.email ?? ''} description={user ? `נרשם ${formatDate(user.createdAt)} · כניסה אחרונה ${formatDate(user.lastSignInAt)}` : ''}>
        {user && (
          <div className="mt-4">
            {journey === undefined ? (
              <div className="grid place-items-center py-8">
                <Loader2 className="animate-spin text-turquoise" size={24} aria-label="טוען" />
              </div>
            ) : summary ? (
              <dl className="grid grid-cols-2 gap-2.5 rounded-2xl bg-mist p-4 text-sm">
                <Item label="שלב" value={STAGES[summary.stage]?.label} />
                <Item label="מסלול" value={summary.track} />
                <Item label="שלב בחיים" value={summary.lifeStage} />
                <Item label="מטרה" value={summary.goal} />
                <Item label="ילדים" value={journey.profile?.hasChildren ? String(journey.profile.childrenCount) : journey.profile ? 'אין' : null} />
                <Item label="הכנסה" value={summary.totals ? money(summary.totals.income) : null} />
                <Item label="הוצאות" value={summary.totals ? money(summary.totals.expenses) : null} />
                <Item label="נשאר" value={summary.totals ? money(summary.totals.remaining) : null} />
                <Item label="אימות" value={journey.unlock ? (journey.unlock.mode === 'server' ? 'שרת' : 'במכשיר') : null} />
                <Item label="תוכנית" value={journey.plan?.data?.plan?.headline} wide />
              </dl>
            ) : (
              <p className="rounded-2xl bg-mist p-4 text-sm text-navy-soft">למשתמש עדיין אין נתוני מסע בענן.</p>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {user.role === 'admin' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isMe}
                  onClick={() =>
                    setConfirm({
                      title: 'להסיר הרשאת ניהול?',
                      description: `${user.email} יחזור להיות משתמש רגיל.`,
                      label: 'הסרת הרשאה',
                      action: () => backend.admin.setRole(user.id, 'user'),
                    })
                  }
                >
                  <ShieldOff size={16} /> הסרת ניהול
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={user.suspended}
                  onClick={() =>
                    setConfirm({
                      title: 'להפוך למנהל מערכת?',
                      description: `${user.email} יוכל לראות את כל המשתמשים ולנהל אותם.`,
                      label: 'מינוי למנהל',
                      action: () => backend.admin.setRole(user.id, 'admin'),
                    })
                  }
                >
                  <ShieldCheck size={16} /> מינוי למנהל
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={isMe}
                onClick={() =>
                  setConfirm(
                    user.suspended
                      ? { title: 'לבטל את ההשעיה?', description: `${user.email} יוכל להשתמש שוב באפליקציה.`, label: 'ביטול השעיה', action: () => backend.admin.setSuspended(user.id, false) }
                      : { title: 'להשעות את המשתמש?', description: `${user.email} לא יוכל להשתמש באפליקציה עד לביטול ההשעיה.`, label: 'השעיה', danger: true, action: () => backend.admin.setSuspended(user.id, true) },
                  )
                }
              >
                {user.suspended ? <UserCheck size={16} /> : <Ban size={16} />} {user.suspended ? 'ביטול השעיה' : 'השעיה'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger sm:col-span-2"
                disabled={!journey}
                onClick={() =>
                  setConfirm({
                    title: 'לאפס את נתוני המשתמש?',
                    description: 'הפרופיל, התקציב והתוכנית של המשתמש יימחקו. החשבון עצמו נשאר.',
                    label: 'איפוס נתונים',
                    danger: true,
                    closeAfter: true,
                    action: () => backend.admin.resetJourney(user.id),
                  })
                }
              >
                <RotateCcw size={16} /> איפוס נתוני המסע
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        busy={busy}
        onConfirm={act}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function Item({ label, value, wide = false }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-xs text-navy-soft">{label}</dt>
      <dd className="font-bold text-navy">{value || '—'}</dd>
    </div>
  );
}
