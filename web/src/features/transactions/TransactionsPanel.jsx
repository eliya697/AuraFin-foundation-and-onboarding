import { memo, useCallback, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, RotateCw } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import TransactionDialog from './TransactionDialog.jsx';
import { budgetLines, formatTxAmount, formatTxDate, lineLabel, resolveLineKey } from '../../lib/transactions.js';
import { useTransactions } from '../../state/TransactionsContext.jsx';

const PAGE = 8;

/** Latest transactions with quick add / edit / delete. */
export default function TransactionsPanel({ budget, profile }) {
  const { transactions, status, save, remove, reload } = useTransactions();
  const lines = useMemo(() => budgetLines(budget, profile), [budget, profile]);
  const [limit, setLimit] = useState(PAGE);
  const [dialog, setDialog] = useState({ open: false, transaction: null });

  const openNew = useCallback(() => setDialog({ open: true, transaction: null }), []);
  const openEdit = useCallback((transaction) => setDialog({ open: true, transaction }), []);
  const close = useCallback(() => setDialog((d) => ({ ...d, open: false })), []);

  const shown = transactions.slice(0, limit);

  return (
    <Card padding="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-navy sm:text-xl">תנועות</h2>
          <p className="text-sm text-navy-soft">מה באמת יצא ונכנס, מול התקציב שתכננתם.</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus size={16} /> הוספה
        </Button>
      </div>

      {status === 'loading' && transactions.length === 0 ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="animate-spin text-turquoise" size={24} aria-label="טוען תנועות" />
        </div>
      ) : status === 'error' && transactions.length === 0 ? (
        <div className="rounded-2xl bg-mist p-4 text-center text-sm text-navy-soft">
          לא הצלחנו לטעון את התנועות.
          <Button variant="ghost" size="sm" onClick={reload} className="ms-1">
            <RotateCw size={14} /> נסו שוב
          </Button>
        </div>
      ) : transactions.length === 0 ? (
        <p className="rounded-2xl bg-mist p-4 text-center text-sm text-navy-soft">
          עוד אין תנועות. הוסיפו את ההוצאה הראשונה — קפה של הבוקר נחשב.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-navy/[0.06]">
            {shown.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} label={lineLabel(resolveLineKey(tx, lines), lines)} onOpen={openEdit} />
            ))}
          </ul>
          {transactions.length > limit && (
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setLimit((n) => n + PAGE * 3)}>
              הצגת עוד ({transactions.length - limit})
            </Button>
          )}
        </>
      )}

      <TransactionDialog open={dialog.open} transaction={dialog.transaction} lines={lines} onSave={save} onDelete={remove} onClose={close} />
    </Card>
  );
}

const TransactionRow = memo(function TransactionRow({ tx, label, onOpen }) {
  const income = tx.kind === 'income';
  const Icon = income ? ArrowDownLeft : ArrowUpRight;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(tx)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-2 text-start transition-colors hover:bg-mist"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${income ? 'bg-mint/15 text-turquoise-dark' : 'bg-mist text-navy-soft'}`}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-navy">{tx.merchant || label}</span>
          <span className="block truncate text-xs text-navy-soft">
            {tx.merchant ? `${label} · ` : ''}
            {formatTxDate(tx.occurredOn)}
          </span>
        </span>
        <span dir="ltr" className={`shrink-0 font-bold tabular-nums ${income ? 'text-turquoise-dark' : 'text-navy'}`}>
          {income ? '+' : '−'}
          {formatTxAmount(tx.amount)}
        </span>
      </button>
    </li>
  );
});
