import { useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';

export const STATEMENT_ACCEPT = '.csv,.pdf,text/csv,text/plain,application/pdf';
const ACCEPTED = /\.(csv|pdf|txt)$/i;

/**
 * Drop zone for bank / credit-card statements (CSV or PDF): drag a file onto it, or tap to pick one.
 * Purely presentational; `onFile(file)` does the reading. While `busy`, it shows a spinner and
 * ignores new files.
 */
export default function BankStatementUploader({ onFile, busy = false, busyLabel = 'קורא את הקובץ…' }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0); // dragenter/leave fire for every child element

  const take = (file) => {
    if (!file || busy) return;
    onFile(file);
  };

  const onDragEnter = (event) => {
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (event) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  };
  const onDrop = (event) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    take(files.find((file) => ACCEPTED.test(file.name) || /pdf|csv|text/.test(file.type)) ?? files[0]);
  };

  return (
    <div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <input
        ref={inputRef}
        type="file"
        accept={STATEMENT_ACCEPT}
        className="sr-only"
        aria-label="קובץ דף חשבון"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          take(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-describedby="statement-drop-hint"
        className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-9 font-bold transition-[border-color,background-color,transform] duration-200 disabled:cursor-progress ${
          dragging ? 'scale-[1.01] border-turquoise bg-turquoise/10 text-turquoise-dark' : 'border-turquoise/40 bg-mist text-turquoise-dark hover:border-turquoise'
        }`}
      >
        {busy ? (
          <>
            <Loader2 size={28} className="animate-spin" aria-hidden="true" />
            <span role="status">{busyLabel}</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2" aria-hidden="true">
              <Upload size={26} />
              <FileText size={26} />
            </span>
            {dragging ? 'שחררו כאן' : 'גררו לכאן קובץ, או הקישו לבחירה'}
          </>
        )}
      </button>
      <p id="statement-drop-hint" className="mt-2 text-center text-xs text-navy-soft">
        CSV או PDF מאתר הבנק / חברת האשראי · הקובץ נקרא רק במכשיר שלכם
      </p>
    </div>
  );
}
