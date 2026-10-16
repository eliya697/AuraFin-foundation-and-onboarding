import { useCallback, useEffect, useId, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.jsx';
import Button from '../../components/ui/Button.jsx';
import MoneyInput from '../../components/ui/MoneyInput.jsx';
import TextInput from '../../components/ui/TextInput.jsx';
import { OTHER_KEY, TX_LIMITS, draftFromTransaction, newDraft, transactionFromDraft, validateDraft } from '../../lib/transactions.js';

const KINDS = [
  { id: 'expense', label: 'הוצאה' },
  { id: 'income', label: 'הכנסה' },
];

const fieldClass =
  'w-full rounded-2xl border-2 border-navy/10 bg-surface px-4 py-3.5 text-lg font-semibold text-navy outline-none transition-colors focus:border-turquoise focus:ring-4 focus:ring-turquoise/15';

/** Add / edit sheet for one transaction. `transaction` null = new. */
export default function TransactionDialog({ open, transaction, lines, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => newDraft());
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lineId = useId();
  const dateId = useId();

  useEffect(() => {
    if (!open) return;
    setDraft(transaction ? draftFromTransaction(transaction) : newDraft());
    setErrors({});
    setFailure('');
    setConfirmDelete(false);
  }, [open, transaction]);

  const change = useCallback(
    (value, name) => {
      setDraft((d) => ({ ...d, [name]: value }));
      setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    },
    [],
  );

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
    const found = validateDraft(draft);
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      setShake((n) => n + 1);
      return;
    }
    run(() => onSave(transactionFromDraft({ ...draft, budgetKey: selectedLine }, { existing: transaction })));
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run(() => onDelete(transaction));
  };

  const formId = `${lineId}-form`;
  // A line removed from the budget since (or the income key after switching kind) shows as "other".
  const selectedLine = lines.some((line) => line.key === draft.budgetKey) ? draft.budgetKey : OTHER_KEY;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={transaction ? 'עריכת תנועה' : 'תנועה חדשה'}
      actions={
        <>
          {transaction && (
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
        <div role="radiogroup" aria-label="סוג התנועה" className="grid grid-cols-2 gap-1 rounded-2xl bg-mist p-1">
          {KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind.id}
              onClick={() => change(kind.id, 'kind')}
              className={`min-h-11 rounded-xl text-sm font-bold transition-colors ${
                draft.kind === kind.id ? 'bg-surface text-navy shadow-sm' : 'text-navy-soft'
              }`}
            >
              {kind.label}
            </button>
          ))}
        </div>

        <MoneyInput name="amount" label="סכום" value={draft.amount} error={errors.amount} onChange={change} shakeSignal={shake} />

        {draft.kind === 'expense' && (
          <div>
            <label htmlFor={lineId} className="mb-2 block text-sm font-semibold text-navy">
              סעיף בתקציב
            </label>
            <select id={lineId} value={selectedLine} onChange={(e) => change(e.target.value, 'budgetKey')} className={fieldClass}>
              {lines.map((line) => (
                <option key={line.key} value={line.key}>
                  {line.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <TextInput
          name="merchant"
          label={draft.kind === 'income' ? 'מקור' : 'בית עסק / תיאור'}
          placeholder={draft.kind === 'income' ? 'משכורת' : 'סופר, קפה, דלק…'}
          value={draft.merchant}
          maxLength={TX_LIMITS.merchant}
          error={errors.merchant}
          onChange={change}
        />

        <div>
          <label htmlFor={dateId} className="mb-2 block text-sm font-semibold text-navy">
            תאריך
          </label>
          <input
            id={dateId}
            type="date"
            value={draft.occurredOn}
            onChange={(e) => change(e.target.value, 'occurredOn')}
            aria-invalid={Boolean(errors.occurredOn)}
            className={`${fieldClass} ${errors.occurredOn ? 'border-danger/70' : ''}`}
          />
          {errors.occurredOn && <p className="mt-1.5 text-sm font-medium text-danger">{errors.occurredOn}</p>}
        </div>

        <TextInput name="note" label="הערה (לא חובה)" value={draft.note} maxLength={TX_LIMITS.note} error={errors.note} onChange={change} />

        {failure && (
          <p role="alert" className="flex items-center gap-1.5 rounded-2xl bg-danger/[0.06] p-3 text-sm font-medium text-danger">
            <AlertCircle size={15} className="shrink-0" /> {failure}
          </p>
        )}
      </form>
    </Dialog>
  );
}
