import { useCallback, useEffect, useId, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.jsx';
import Button from '../../components/ui/Button.jsx';
import MoneyInput from '../../components/ui/MoneyInput.jsx';
import TextInput from '../../components/ui/TextInput.jsx';
import { GOAL_LIMITS, draftFromGoal, goalFromDraft, newGoalDraft, validateGoalDraft } from '../../lib/goals.js';
import { formatCurrency } from '../../lib/budget.js';

const fieldClass =
  'w-full rounded-2xl border-2 border-navy/10 bg-surface px-4 py-3.5 text-lg font-semibold text-navy outline-none transition-colors focus:border-turquoise focus:ring-4 focus:ring-turquoise/15';

/** Add / edit a savings goal. When editing, "הפקדה" adds to the saved amount. */
export default function GoalDialog({ open, goal, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(newGoalDraft);
  const [deposit, setDeposit] = useState('');
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateId = useId();
  const formId = `${dateId}-form`;

  useEffect(() => {
    if (!open) return;
    setDraft(goal ? draftFromGoal(goal) : newGoalDraft());
    setDeposit('');
    setErrors({});
    setFailure('');
    setConfirmDelete(false);
  }, [open, goal]);

  const change = useCallback((value, name) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const run = async (action) => {
    setBusy(true);
    setFailure('');
    try {
      await action();
      onClose();
    } catch (error) {
      setFailure(error?.message || 'השמירה נכשלה. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const saved = (Number(draft.saved) || 0) + (Number(deposit) || 0);
    const next = { ...draft, saved: deposit ? String(Math.round(saved * 100) / 100) : draft.saved };
    // An unchanged past deadline on an existing goal stays valid (only new dates must be in the future).
    const found = validateGoalDraft(goal?.deadline && next.deadline === goal.deadline ? { ...next, deadline: '' } : next);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      setShake((n) => n + 1);
      return;
    }
    run(() => onSave(goalFromDraft(next, { existing: goal })));
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run(() => onDelete(goal));
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={goal ? 'עריכת יעד' : 'יעד חיסכון חדש'}
      actions={
        <>
          {goal && (
            <Button variant={confirmDelete ? 'danger' : 'ghost'} onClick={remove} disabled={busy} className="sm:me-auto">
              <Trash2 size={16} /> {confirmDelete ? 'לחצו שוב למחיקה' : 'מחיקה'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            ביטול
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? 'שומר…' : 'שמירה'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="-mx-1 mt-4 max-h-[60dvh] space-y-4 overflow-y-auto overscroll-contain px-1 pb-1">
        <TextInput
          name="name"
          label="שם היעד"
          placeholder="קרן חירום, טיול, הון עצמי לדירה…"
          value={draft.name}
          maxLength={GOAL_LIMITS.name}
          error={errors.name}
          onChange={change}
          shakeSignal={shake}
        />
        <MoneyInput name="target" label="סכום היעד" value={draft.target} error={errors.target} onChange={change} shakeSignal={shake} />
        <MoneyInput
          name="saved"
          label="כמה כבר חסכתם"
          hint={goal ? undefined : 'לא חובה. אפשר להתחיל מ-0.'}
          value={draft.saved}
          error={errors.saved}
          onChange={change}
        />
        {goal && (
          <MoneyInput
            name="deposit"
            label="הפקדה חדשה"
            hint={deposit ? `אחרי השמירה: ${formatCurrency((Number(draft.saved) || 0) + Number(deposit))}` : 'יתווסף לסכום שנחסך.'}
            value={deposit}
            onChange={(value) => setDeposit(value)}
          />
        )}
        <div>
          <label htmlFor={dateId} className="mb-2 block text-sm font-semibold text-navy">
            תאריך יעד (לא חובה)
          </label>
          <input
            id={dateId}
            type="date"
            value={draft.deadline}
            onChange={(e) => change(e.target.value, 'deadline')}
            aria-invalid={Boolean(errors.deadline)}
            className={`${fieldClass} ${errors.deadline ? 'border-danger/70' : ''}`}
          />
          {errors.deadline && <p className="mt-1.5 text-sm font-medium text-danger">{errors.deadline}</p>}
        </div>

        {failure && (
          <p role="alert" className="flex items-center gap-1.5 rounded-2xl bg-danger/[0.06] p-3 text-sm font-medium text-danger">
            <AlertCircle size={15} className="shrink-0" /> {failure}
          </p>
        )}
      </form>
    </Dialog>
  );
}
