import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.jsx';
import Button from '../../components/ui/Button.jsx';
import {
  buildPreview,
  isMappingComplete,
  markDuplicates,
  readImportFile,
  suggestBudgetKeys,
  toTransactions,
  withFingerprints,
} from '../../lib/csvImport.js';
import { formatTxAmount, formatTxDate } from '../../lib/transactions.js';
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
const fieldClass =
  'w-full rounded-xl border-2 border-navy/10 bg-white px-3 py-2.5 text-sm font-semibold text-navy outline-none transition-colors focus:border-turquoise focus:ring-4 focus:ring-turquoise/15';

/**
 * Bank / credit-card CSV import: pick a file → confirm the column mapping → preview (duplicates and
 * bad rows excluded, budget line per row) → queue through the outbox. Logic lives in lib/csvImport.js.
 */
export default function CsvImportDialog({ open, lines, onClose }) {
  const { userId, all, saveMany } = useTransactions();
  const [stage, setStage] = useState('pick'); // pick | map | preview | done
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [positiveIs, setPositiveIs] = useState('expense');
  const [items, setItems] = useState([]);
  const [imported, setImported] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStage('pick');
    setFile(null);
    setItems([]);
    setError('');
  }, [open]);

  const pickFile = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setError('');
    try {
      const parsed = readImportFile(await readBytes(chosen));
      setFile({ ...parsed, name: chosen.name });
      setMapping(parsed.mapping);
      setPositiveIs(parsed.positiveIs);
      setStage('map');
    } catch (failure) {
      setError(failure?.message || 'לא הצלחנו לקרוא את הקובץ.');
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
    const transactions = toTransactions(items);
    setBusy(true);
    try {
      await saveMany(transactions);
      setImported(transactions.length);
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
    }),
    [items],
  );

  const updateItem = (index, patch) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const selectable = items.filter((i) => !i.error && !i.duplicate);
  const allSelected = selectable.length > 0 && selectable.every((i) => i.selected);
  const toggleAll = () => setItems((list) => list.map((item) => (item.error || item.duplicate ? item : { ...item, selected: !allSelected })));

  const actions = {
    pick: (
      <Button variant="secondary" onClick={onClose}>
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

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} dismissible={!busy} size="lg" title="ייבוא תנועות מקובץ" actions={actions}>
      <div className="-mx-1 mt-4 max-h-[62dvh] overflow-y-auto px-1 pb-1">
        {stage === 'pick' && (
          <div className="space-y-4">
            <p className="leading-relaxed text-navy-soft">
              הורידו מאתר הבנק או חברת האשראי את פירוט התנועות כקובץ CSV (בדרך כלל &quot;ייצוא&quot; או &quot;הורדה לאקסל&quot; ← CSV) ובחרו
              אותו כאן. הקובץ נקרא רק במכשיר שלכם.
            </p>
            <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={pickFile} aria-label="קובץ CSV" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-turquoise/40 bg-mist px-4 py-8 font-bold text-turquoise-dark transition-colors hover:border-turquoise"
            >
              <Upload size={26} aria-hidden="true" />
              בחירת קובץ CSV
            </button>
          </div>
        )}

        {stage === 'map' && file && mapping && (
          <MappingStep
            file={file}
            mapping={mapping}
            onMapping={setMapping}
            positiveIs={positiveIs}
            onPositiveIs={setPositiveIs}
            sample={sample}
          />
        )}

        {stage === 'preview' && (
          <PreviewStep items={items} counts={counts} lines={lines} allSelected={allSelected} onToggleAll={toggleAll} onUpdate={updateItem} />
        )}

        {stage === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-turquoise-dark" aria-hidden="true" />
            <p className="text-lg font-extrabold text-navy">יובאו {imported} תנועות</p>
            <p className="text-sm text-navy-soft">הן נשמרו במכשיר ויסונכרנו לענן ברקע.</p>
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
            className={`min-h-10 rounded-lg px-2 text-xs font-bold transition-colors sm:text-sm ${value === option.id ? 'bg-white text-navy shadow-sm' : 'text-navy-soft'}`}
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
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-2xl bg-mist p-3 text-sm text-navy-soft">
        <FileSpreadsheet size={18} className="shrink-0 text-turquoise-dark" aria-hidden="true" />
        <span className="min-w-0 truncate">
          <b className="text-navy">{file.name}</b> · {dataRows} שורות · {file.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1255'}
        </span>
      </p>
      <p className="text-sm text-navy-soft">בדקו שהעמודות זוהו נכון ותקנו אם צריך.</p>

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

function PreviewLine({ item, children }) {
  const income = item.kind === 'income';
  return (
    <li className={`flex items-center gap-2 py-2 text-sm ${item.error || item.duplicate ? 'opacity-60' : ''}`}>
      {children}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-navy">{item.merchant || 'ללא תיאור'}</span>
        <span className="block truncate text-xs text-navy-soft">
          {item.occurredOn ? formatTxDate(item.occurredOn) : ''}
          {item.error && <span className="text-danger"> · {item.error}</span>}
          {item.duplicate && <span> · כבר יובא</span>}
          {item.similar && <span className="text-amber-700"> · דומה לתנועה שהזנתם</span>}
        </span>
      </span>
      {item.amount !== null && (
        <span dir="ltr" className={`shrink-0 font-bold tabular-nums ${income ? 'text-turquoise-dark' : 'text-navy'}`}>
          {income ? '+' : '−'}
          {formatTxAmount(item.amount)}
        </span>
      )}
    </li>
  );
}

function PreviewStep({ items, counts, lines, allSelected, onToggleAll, onUpdate }) {
  const shown = items.slice(0, PREVIEW_LIMIT);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-turquoise/10 px-3 py-1.5 text-turquoise-dark">{counts.selected} ייובאו</span>
        {counts.duplicates > 0 && <span className="rounded-full bg-mist px-3 py-1.5 text-navy-soft">{counts.duplicates} כבר קיימות</span>}
        {counts.errors > 0 && <span className="rounded-full bg-danger/[0.08] px-3 py-1.5 text-danger">{counts.errors} שורות לא תקינות</span>}
        {counts.similar > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{counts.similar} אולי כבר הוזנו ידנית</span>}
        <button type="button" onClick={onToggleAll} className="ms-auto min-h-10 rounded-lg px-2 text-turquoise-dark hover:bg-mist">
          {allSelected ? 'ניקוי הבחירה' : 'בחירת הכל'}
        </button>
      </div>
      <ul className="divide-y divide-navy/[0.06]">
        {shown.map((item, index) => {
          const disabled = Boolean(item.error || item.duplicate);
          return (
            <PreviewLine key={item.line} item={item}>
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
                  onChange={(e) => onUpdate(index, { budgetKey: e.target.value })}
                  className="order-last max-w-[9rem] shrink-0 rounded-lg border border-navy/10 bg-white px-1.5 py-1.5 text-xs font-semibold text-navy sm:max-w-[12rem]"
                >
                  {lines.map((line) => (
                    <option key={line.key} value={line.key}>
                      {line.label}
                    </option>
                  ))}
                </select>
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
