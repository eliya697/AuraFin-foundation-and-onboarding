import { memo, useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, PencilLine, Sparkles, WandSparkles } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.jsx';
import Button from '../../components/ui/Button.jsx';
import BankStatementUploader from './BankStatementUploader.jsx';
import {
  buildPreview,
  isMappingComplete,
  markDuplicates,
  readImportFile,
  reviseItem,
  suggestBudgetKeys,
  toTransactions,
  withFingerprints,
} from '../../lib/csvImport.js';
import { isPdfFile, readPdfStatement } from '../../lib/pdfStatement.js';
import { applyBudgetSuggestion, suggestBudget } from '../../lib/budgetSuggestion.js';
import { INCOME_KEY, formatTxAmount, formatTxDate, mergeTransactions } from '../../lib/transactions.js';
import { formatMonth } from '../../lib/analytics.js';
import { useTransactions } from '../../state/TransactionsContext.jsx';

const PREVIEW_LIMIT = 200;

/** File → bytes; FileReader fallback for browsers (and jsdom) without Blob.arrayBuffer(). */
function readBytes(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** CSV is parsed synchronously; pdf.js (~1 MB) is fetched inside readPdfStatement, only for PDFs. */
async function readStatement(file) {
  const bytes = await readBytes(file);
  return isPdfFile(bytes, file.name) ? readPdfStatement(bytes) : readImportFile(bytes);
}

const fieldClass =
  'w-full rounded-xl border-2 border-navy/10 bg-surface px-3 py-2.5 text-sm font-semibold text-navy outline-none transition-colors focus:border-turquoise focus:ring-4 focus:ring-turquoise/15';

/**
 * Bank / credit-card statement import (CSV or PDF): drop a file → confirm the column mapping →
 * preview and fix rows (duplicates and bad rows excluded, an auto-suggested budget line per row) →
 * queue through the outbox → a budget suggestion from the user's real spending. Parsing lives in
 * lib/csvImport.js and lib/pdfStatement.js, the suggestion in lib/budgetSuggestion.js.
 *
 * `onApplyBudget(budget)` (optional) opens the budget gate with the suggested numbers.
 */
export default function StatementImportDialog({ open, lines, budget, profile, onApplyBudget, onClose }) {
  const { userId, all, saveMany } = useTransactions();
  const [stage, setStage] = useState('pick'); // pick | map | preview | done
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [positiveIs, setPositiveIs] = useState('expense');
  const [items, setItems] = useState([]);
  const [imported, setImported] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStage('pick');
    setFile(null);
    setItems([]);
    setImported([]);
    setError('');
  }, [open]);

  const pickFile = async (chosen) => {
    setError('');
    setReading(true);
    try {
      const parsed = await readStatement(chosen);
      setFile({ ...parsed, name: chosen.name });
      setMapping(parsed.mapping);
      setPositiveIs(parsed.positiveIs);
      setStage('map');
    } catch (failure) {
      setError(failure?.message || 'לא הצלחנו לקרוא את הקובץ.');
    } finally {
      setReading(false);
    }
  };

  const sample = useMemo(
    () => (file && mapping && isMappingComplete(mapping) ? buildPreview(file.rows, file.headerIndex, mapping, { positiveIs }).slice(0, 3) : []),
    [file, mapping, positiveIs],
  );

  const toPreview = async () => {
    setBusy(true);
    try {
      const built = await withFingerprints(buildPreview(file.rows, file.headerIndex, mapping, { positiveIs }), userId);
      const prepared = suggestBudgetKeys(markDuplicates(built, all), all, lines).map((item) => ({
        ...item,
        selected: !item.error && !item.duplicate && !item.similar,
      }));
      if (!prepared.length) {
        setError('לא נמצאו תנועות בעמודות שנבחרו.');
        return;
      }
      setError('');
      setItems(prepared);
      setStage('preview');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    const transactions = toTransactions(items, { source: file?.encoding === 'pdf' ? 'pdf' : 'csv' });
    setBusy(true);
    try {
      await saveMany(transactions);
      setImported(transactions);
      setStage('done');
    } catch (failure) {
      setError(failure?.message || 'הייבוא נכשל. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(
    () => ({
      selected: items.filter((i) => i.selected && !i.error && !i.duplicate).length,
      duplicates: items.filter((i) => i.duplicate).length,
      errors: items.filter((i) => i.error).length,
      similar: items.filter((i) => i.similar).length,
      auto: items.filter((i) => i.autoCategorized && !i.error && !i.duplicate).length,
    }),
    [items],
  );

  const updateItem = (index, patch) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const editItem = async (index, patch) => {
    const revised = await reviseItem(items[index], patch, userId);
    const [checked] = markDuplicates([revised], all);
    setItems((list) => list.map((item, i) => (i === index ? { ...checked, selected: checked.duplicate ? false : revised.selected } : item)));
  };
  const selectable = items.filter((i) => !i.error && !i.duplicate);
  const allSelected = selectable.length > 0 && selectable.every((i) => i.selected);
  const toggleAll = () => setItems((list) => list.map((item) => (item.error || item.duplicate ? item : { ...item, selected: !allSelected })));

  const actions = {
    pick: (
      <Button variant="secondary" onClick={onClose} disabled={reading}>
        ביטול
      </Button>
    ),
    map: (
      <>
        <Button variant="secondary" onClick={() => setStage('pick')} disabled={busy}>
          קובץ אחר
        </Button>
        <Button onClick={toPreview} disabled={busy || !mapping || !isMappingComplete(mapping)}>
          {busy ? 'מכין…' : 'המשך לתצוגה מקדימה'}
        </Button>
      </>
    ),
    preview: (
      <>
        <Button variant="secondary" onClick={() => setStage('map')} disabled={busy}>
          חזרה למיפוי
        </Button>
        <Button onClick={runImport} disabled={busy || counts.selected === 0}>
          {busy ? 'מייבא…' : `ייבוא ${counts.selected} תנועות`}
        </Button>
      </>
    ),
    done: (
      <Button onClick={onClose} data-autofocus>
        סיום
      </Button>
    ),
  }[stage];

  const locked = busy || reading;
  return (
    <Dialog open={open} onClose={locked ? undefined : onClose} dismissible={!locked} size="lg" title="ייבוא דף חשבון" actions={actions}>
      <div className="-mx-1 mt-4 max-h-[62dvh] overflow-y-auto overscroll-contain px-1 pb-1">
        {stage === 'pick' && (
          <div className="space-y-4">
            <p className="leading-relaxed text-navy-soft">
              הורידו מאתר הבנק או חברת האשראי את פירוט התנועות כקובץ CSV (&quot;ייצוא&quot; / &quot;הורדה לאקסל&quot; ← CSV) או כ-PDF, וגררו
              אותו לכאן. נזהה את התנועות, נציע סעיף לכל אחת ותוכלו לתקן לפני השמירה.
            </p>
            <BankStatementUploader onFile={pickFile} busy={reading} />
          </div>
        )}

        {stage === 'map' && file && mapping && (
          <MappingStep file={file} mapping={mapping} onMapping={setMapping} positiveIs={positiveIs} onPositiveIs={setPositiveIs} sample={sample} />
        )}

        {stage === 'preview' && (
          <PreviewStep
            items={items}
            counts={counts}
            lines={lines}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onUpdate={updateItem}
            onEdit={editItem}
          />
        )}

        {stage === 'done' && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 pt-4 text-center">
              <CheckCircle2 size={40} className="text-turquoise-dark" aria-hidden="true" />
              <p className="text-lg font-extrabold text-navy">יובאו {imported.length} תנועות</p>
              <p className="text-sm text-navy-soft">הן נשמרו במכשיר ויסונכרנו לענן ברקע.</p>
            </div>
            {budget && profile && imported.length > 0 && (
              <BudgetSuggestionPanel
                transactions={mergeTransactions(all, imported)}
                budget={budget}
                profile={profile}
                lines={lines}
                onApply={
                  onApplyBudget &&
                  ((next) => {
                    onClose();
                    onApplyBudget(next);
                  })
                }
              />
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 flex items-center gap-1.5 rounded-2xl bg-danger/[0.06] p-3 text-sm font-medium text-danger">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function ColumnSelect({ label, value, headers, optional = false, onChange }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-navy-soft">
        {label}
      </label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={fieldClass}>
        <option value="">{optional ? '— ללא —' : '— בחרו עמודה —'}</option>
        {headers.map((header, index) => (
          <option key={index} value={index}>
            {header || `עמודה ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-navy-soft">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-10 rounded-lg px-2 text-xs font-bold transition-colors sm:text-sm ${value === option.id ? 'bg-surface text-navy shadow-sm' : 'text-navy-soft'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MappingStep({ file, mapping, onMapping, positiveIs, onPositiveIs, sample }) {
  const set = (field) => (value) => onMapping({ ...mapping, [field]: value });
  const dataRows = file.rows.length - file.headerIndex - 1;
  const pdf = file.encoding === 'pdf';
  const FileIcon = pdf ? FileText : FileSpreadsheet;
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-2xl bg-mist p-3 text-sm text-navy-soft">
        <FileIcon size={18} className="shrink-0 text-turquoise-dark" aria-hidden="true" />
        <span className="min-w-0 truncate">
          <b className="text-navy">{file.name}</b> · {dataRows} {pdf ? 'תנועות זוהו' : 'שורות'} ·{' '}
          {pdf ? `PDF, ${file.pages} עמודים` : file.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1255'}
        </span>
      </p>
      <p className="text-sm text-navy-soft">
        {pdf ? 'זיהינו את הטבלה מתוך ה-PDF. בדקו שהעמודות נכונות — אם יש כמה סכומים בשורה, בחרו את סכום החיוב.' : 'בדקו שהעמודות זוהו נכון ותקנו אם צריך.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <ColumnSelect label="תאריך" value={mapping.date} headers={file.headers} onChange={set('date')} />
        <ColumnSelect label="בית עסק / תיאור" value={mapping.merchant} headers={file.headers} optional onChange={set('merchant')} />
      </div>

      <Segmented
        label="איך מופיע הסכום?"
        value={mapping.amountMode}
        options={[
          { id: 'signed', label: 'עמודת סכום אחת' },
          { id: 'split', label: 'עמודות חובה וזכות' },
        ]}
        onChange={set('amountMode')}
      />

      {mapping.amountMode === 'signed' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ColumnSelect label="סכום" value={mapping.amount} headers={file.headers} onChange={set('amount')} />
          <Segmented
            label="סכום חיובי הוא…"
            value={positiveIs}
            options={[
              { id: 'expense', label: 'הוצאה (אשראי)' },
              { id: 'income', label: 'הכנסה (בנק)' },
            ]}
            onChange={onPositiveIs}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <ColumnSelect label="חובה (יצא)" value={mapping.debit} headers={file.headers} optional onChange={set('debit')} />
          <ColumnSelect label="זכות (נכנס)" value={mapping.credit} headers={file.headers} optional onChange={set('credit')} />
        </div>
      )}

      <ColumnSelect label="הערה" value={mapping.note} headers={file.headers} optional onChange={set('note')} />

      {sample.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold text-navy-soft">כך זה ייראה</p>
          <ul className="divide-y divide-navy/[0.06] rounded-2xl border border-navy/[0.06] px-3">
            {sample.map((item) => (
              <PreviewLine key={item.line} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PreviewLine({ item, children, after }) {
  const income = item.kind === 'income';
  return (
    <li className="cv-row py-2">
      <div className={`flex items-center gap-2 text-sm ${item.duplicate ? 'opacity-60' : ''}`}>
        {children}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-navy">{item.merchant || 'ללא תיאור'}</span>
          <span className="block truncate text-xs text-navy-soft">
            {item.occurredOn ? formatTxDate(item.occurredOn) : ''}
            {item.error && <span className="text-danger"> · {item.error}</span>}
            {item.duplicate && <span> · כבר יובא</span>}
            {item.similar && <span className="text-amber-700"> · דומה לתנועה שהזנתם</span>}
            {item.edited && !item.error && <span className="text-turquoise-dark"> · תוקן</span>}
          </span>
        </span>
        {item.amount !== null && item.amount !== undefined && (
          <span dir="ltr" className={`shrink-0 font-bold tabular-nums ${income ? 'text-turquoise-dark' : 'text-navy'}`}>
            {income ? '+' : '−'}
            {formatTxAmount(item.amount)}
          </span>
        )}
      </div>
      {after}
    </li>
  );
}

function PreviewStep({ items, counts, lines, allSelected, onToggleAll, onUpdate, onEdit }) {
  const [editing, setEditing] = useState(null); // index of the row being fixed
  const shown = items.slice(0, PREVIEW_LIMIT);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-turquoise/10 px-3 py-1.5 text-turquoise-dark">{counts.selected} ייובאו</span>
        {counts.duplicates > 0 && <span className="rounded-full bg-mist px-3 py-1.5 text-navy-soft">{counts.duplicates} כבר קיימות</span>}
        {counts.errors > 0 && <span className="rounded-full bg-danger/[0.08] px-3 py-1.5 text-danger">{counts.errors} שורות לא תקינות</span>}
        {counts.similar > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{counts.similar} אולי כבר הוזנו ידנית</span>}
        {counts.auto > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-royal/10 px-3 py-1.5 text-royal dark:text-navy">
            <WandSparkles size={13} aria-hidden="true" /> {counts.auto} סווגו אוטומטית
          </span>
        )}
        <button type="button" onClick={onToggleAll} className="ms-auto min-h-10 rounded-lg px-2 text-turquoise-dark hover:bg-mist">
          {allSelected ? 'ניקוי הבחירה' : 'בחירת הכל'}
        </button>
      </div>
      <p className="mb-2 text-xs text-navy-soft">בדקו את הסעיפים. משהו לא נקרא נכון? הקישו על העיפרון כדי לתקן את השורה.</p>
      <ul className="divide-y divide-navy/[0.06]">
        {shown.map((item, index) => {
          const disabled = Boolean(item.error || item.duplicate);
          return (
            <PreviewLine
              key={item.line}
              item={item}
              after={
                editing === index && (
                  <RowEditor
                    item={item}
                    onCancel={() => setEditing(null)}
                    onSave={async (patch) => {
                      await onEdit(index, patch);
                      setEditing(null);
                    }}
                  />
                )
              }
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--color-turquoise)]"
                checked={Boolean(item.selected) && !disabled}
                disabled={disabled}
                aria-label={`ייבוא שורה ${item.line}`}
                onChange={(e) => onUpdate(index, { selected: e.target.checked })}
              />
              {!disabled && item.kind === 'expense' && (
                <select
                  aria-label={`סעיף בתקציב לשורה ${item.line}`}
                  value={lines.some((l) => l.key === item.budgetKey) ? item.budgetKey : 'other'}
                  onChange={(e) => onUpdate(index, { budgetKey: e.target.value, autoCategorized: false })}
                  className="order-last max-w-[9rem] shrink-0 rounded-lg border border-navy/10 bg-surface px-1.5 py-1.5 text-xs font-semibold text-navy sm:max-w-[12rem]"
                >
                  {lines.map((line) => (
                    <option key={line.key} value={line.key}>
                      {line.label}
                    </option>
                  ))}
                </select>
              )}
              {!item.duplicate && (
                <button
                  type="button"
                  onClick={() => setEditing(editing === index ? null : index)}
                  aria-label={`תיקון שורה ${item.line}`}
                  aria-expanded={editing === index}
                  className="order-last grid h-9 w-9 shrink-0 place-items-center rounded-lg text-navy-soft hover:bg-mist hover:text-navy"
                >
                  <PencilLine size={15} aria-hidden="true" />
                </button>
              )}
            </PreviewLine>
          );
        })}
      </ul>
      {items.length > PREVIEW_LIMIT && (
        <p className="mt-2 text-center text-xs text-navy-soft">
          מוצגות {PREVIEW_LIMIT} שורות ראשונות מתוך {items.length}. השאר ייובאו עם הסעיף שהוצע להן.
        </p>
      )}
    </div>
  );
}

/** Inline fix for one preview row: date, description, amount and direction. */
function RowEditor({ item, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    occurredOn: item.occurredOn ?? '',
    merchant: item.merchant ?? '',
    amount: item.amount ?? '',
    kind: item.kind,
  });
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setDraft((d) => ({ ...d, [field]: event.target.value }));
  const id = useId();
  return (
    <div className="mt-2 grid gap-2 rounded-2xl bg-mist p-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
      <label className="text-xs font-bold text-navy-soft" htmlFor={`${id}-date`}>
        תאריך
        <input id={`${id}-date`} type="date" value={draft.occurredOn} onChange={set('occurredOn')} className={`${fieldClass} mt-1`} />
      </label>
      <label className="text-xs font-bold text-navy-soft" htmlFor={`${id}-merchant`}>
        תיאור
        <input id={`${id}-merchant`} type="text" value={draft.merchant} onChange={set('merchant')} className={`${fieldClass} mt-1`} />
      </label>
      <label className="text-xs font-bold text-navy-soft" htmlFor={`${id}-amount`}>
        סכום
        <input id={`${id}-amount`} type="number" inputMode="decimal" min="0" step="0.01" value={draft.amount} onChange={set('amount')} className={`${fieldClass} mt-1`} />
      </label>
      <label className="text-xs font-bold text-navy-soft" htmlFor={`${id}-kind`}>
        סוג
        <select id={`${id}-kind`} value={draft.kind} onChange={set('kind')} className={`${fieldClass} mt-1`}>
          <option value="expense">הוצאה</option>
          <option value="income">הכנסה</option>
        </select>
      </label>
      <div className="flex gap-2 sm:col-span-4 sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          ביטול
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft);
            } finally {
              setSaving(false);
            }
          }}
        >
          שמירת התיקון
        </Button>
      </div>
    </div>
  );
}

/** After an import: the budget the user's actual spending implies, with one tap to adopt it. */
const BudgetSuggestionPanel = memo(function BudgetSuggestionPanel({ transactions, budget, profile, lines, onApply }) {
  const suggestion = useMemo(() => suggestBudget(transactions, { budget, profile, lines }), [transactions, budget, profile, lines]);
  const changed = suggestion.rows.filter((row) => row.changed);
  const incomeChanged = suggestion.income.suggested !== null && Math.abs(suggestion.income.suggested - suggestion.income.current) >= 50;
  const [accepted, setAccepted] = useState(() => new Set([...changed.map((r) => r.key), ...(incomeChanged ? [INCOME_KEY] : [])]));

  if (!suggestion.months.length || (!changed.length && !incomeChanged)) {
    return (
      <p className="rounded-2xl bg-mist p-4 text-center text-sm text-navy-soft">
        התקציב שלכם תואם את ההוצאות בפועל — אין מה לעדכן כרגע.
      </p>
    );
  }

  const toggle = (key) =>
    setAccepted((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const monthsLabel =
    suggestion.months.length === 1
      ? formatMonth(suggestion.months[0], 'long')
      : `${suggestion.months.length} חודשים (${formatMonth(suggestion.months[0])}–${formatMonth(suggestion.months[suggestion.months.length - 1])})`;
  const savings = suggestion.projectedSavings;

  return (
    <section aria-labelledby="budget-suggestion-title" className="rounded-[24px] border border-turquoise/20 bg-turquoise/[0.05] p-4">
      <h3 id="budget-suggestion-title" className="flex items-center gap-2 font-extrabold text-navy">
        <Sparkles size={18} className="text-turquoise-dark" aria-hidden="true" /> תקציב חכם לפי ההוצאות בפועל
      </h3>
      <p className="mt-1 text-sm text-navy-soft">ממוצע חודשי מתוך {monthsLabel}. סמנו מה לעדכן:</p>
      <ul className="mt-3 space-y-1.5">
        {incomeChanged && (
          <SuggestionRow
            label="הכנסה חודשית"
            current={suggestion.income.current}
            suggested={suggestion.income.suggested}
            checked={accepted.has(INCOME_KEY)}
            onToggle={() => toggle(INCOME_KEY)}
          />
        )}
        {changed.map((row) => (
          <SuggestionRow key={row.key} label={row.label} current={row.current} suggested={row.suggested} checked={accepted.has(row.key)} onToggle={() => toggle(row.key)} />
        ))}
      </ul>
      {suggestion.unplanned > 0 && (
        <p className="mt-3 text-xs text-navy-soft">
          עוד {formatTxAmount(suggestion.unplanned)} בחודש יצאו על דברים שאין להם סעיף. שווה להוסיף להם הוצאה אישית בעדכון הנתונים.
        </p>
      )}
      <p className={`mt-3 text-sm font-bold ${savings >= 0 ? 'text-turquoise-dark' : 'text-danger'}`}>
        {savings >= 0 ? `לפי המספרים האלה נשארים לחיסכון כ-${formatTxAmount(savings)} בחודש.` : `לפי המספרים האלה יש גירעון של כ-${formatTxAmount(-savings)} בחודש.`}
      </p>
      {onApply && (
        <Button className="mt-4 w-full" disabled={accepted.size === 0} onClick={() => onApply(applyBudgetSuggestion(budget, suggestion, accepted))}>
          עדכון התקציב ({accepted.size})
        </Button>
      )}
      {onApply && <p className="mt-2 text-center text-xs text-navy-soft">תעברו למסך עדכון הנתונים כדי לבדוק ולאשר.</p>}
    </section>
  );
});

function SuggestionRow({ label, current, suggested, checked, onToggle }) {
  const up = suggested > current;
  return (
    <li>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-5 w-5 shrink-0 accent-[var(--color-turquoise)]" />
        <span className="min-w-0 flex-1 truncate font-semibold text-navy">{label}</span>
        <span className="shrink-0 tabular-nums text-navy-soft line-through">{formatTxAmount(current)}</span>
        <span className={`shrink-0 font-bold tabular-nums ${up ? 'text-amber-700' : 'text-turquoise-dark'}`}>{formatTxAmount(suggested)}</span>
      </label>
    </li>
  );
}
