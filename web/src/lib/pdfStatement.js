import { guessMapping, guessPositiveIs } from './csvImport.js';

/**
 * Bank / credit-card statements as PDF. The text is extracted in the browser with pdf.js (loaded on
 * demand, never sent anywhere), regrouped into visual lines, and every line that holds a date and at
 * least one money amount becomes a row. The rows get a synthetic header so the CSV pipeline
 * (guessMapping → buildPreview → … → toTransactions) handles them unchanged, and the user can still
 * re-map the columns and fix rows in the preview.
 *
 *   extractPdfLines (pdf.js) → rowsFromPdfLines (pure, tests/pdfStatement.test.js) → readPdfStatement
 *
 * Scanned statements (images, no text layer) have nothing to extract; the user is told to export a
 * CSV instead.
 */

export const PDF_LIMITS = Object.freeze({ maxBytes: 15 * 1024 * 1024, maxPages: 60 });

export const PDF_HEADERS = ['תאריך', 'תיאור', 'סכום', 'סכום נוסף', 'סכום נוסף 2'];

const DATE_TOKEN = /^\d{1,2}[./-]\d{1,2}[./-](\d{2}|\d{4})$/;
// Money always has agorot in statements ("1,234.50", "-42.00", "42.00-", "(42.00)", "₪42.00").
// Requiring the decimals keeps card digits, reference numbers and years out.
const AMOUNT_TOKEN = /^\(?[-−]?₪?[-−]?\d{1,3}(,\d{3})*\.\d{2}[-−]?\)?$|^\(?[-−]?₪?\d+\.\d{2}[-−]?\)?$/;
const REFERENCE_TOKEN = /^\d{5,}$/;
const HEBREW = /[֐-׿]/;

/** Is this file a PDF? By magic bytes ("%PDF"), falling back to the name. */
export function isPdfFile(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return true;
  return /\.pdf$/i.test(name);
}

const normalizeMinus = (token) => token.replace(/−/g, '-').replace(/₪/g, '');

/**
 * Visual lines ([[cell, …], …], cells in reading order) → { headers, rows } where each row is
 * [date, description, amount, amount2, amount3]. Lines without a date and an amount (titles, page
 * footers, column headers, running totals without a date) are dropped.
 */
export function rowsFromPdfLines(lines) {
  const rows = [];
  for (const cells of lines) {
    const tokens = cells.flatMap((cell) => String(cell ?? '').split(/\s+/)).map((t) => t.trim()).filter(Boolean);
    let date = null;
    const amounts = [];
    const description = [];
    for (const token of tokens) {
      if (DATE_TOKEN.test(token)) {
        date ??= token; // a second date on the line (charge / value date) is dropped
      } else if (AMOUNT_TOKEN.test(token)) {
        amounts.push(normalizeMinus(token));
      } else if (!REFERENCE_TOKEN.test(token) && token !== '₪') {
        description.push(token);
      }
    }
    if (!date || !amounts.length) continue;
    rows.push([date, description.join(' '), amounts[0], amounts[1] ?? '', amounts[2] ?? '']);
  }
  return { headers: PDF_HEADERS, rows };
}

/**
 * pdf.js text items of one page → visual lines. Items whose baselines are within half a glyph
 * height share a line; inside a line, a horizontal gap wider than ~a space starts a new cell.
 * A mostly-Hebrew page reads right to left, so every line's cells (also all-digit lines) are
 * reversed into reading order.
 */
export function groupTextItems(items) {
  const glyphs = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width ?? 0,
      height: Math.abs(item.height || item.transform[3] || 10),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const hebrew = glyphs.filter((g) => HEBREW.test(g.str)).length;
  const latin = glyphs.filter((g) => /[A-Za-z]/.test(g.str)).length;
  const rtl = hebrew > 0 && hebrew >= latin;

  const lines = [];
  for (const glyph of glyphs) {
    const line = lines.find((l) => Math.abs(l.y - glyph.y) <= Math.max(2, glyph.height * 0.5));
    if (line) line.items.push(glyph);
    else lines.push({ y: glyph.y, items: [glyph] });
  }

  return lines.map((line) => {
    const sorted = line.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let end = -Infinity;
    for (const glyph of sorted) {
      const gap = glyph.x - end;
      if (cells.length && gap < Math.max(3, glyph.height * 0.35)) cells[cells.length - 1] += glyph.str;
      else cells.push(glyph.str);
      end = glyph.x + glyph.width;
    }
    return (rtl ? cells.reverse() : cells).map((cell) => cell.trim()).filter(Boolean);
  });
}

let pdfjsPromise = null;

/** pdf.js with its worker, loaded once and only when a PDF is actually opened. */
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** PDF bytes → visual lines across all pages (top to bottom). Throws Hebrew messages. */
export async function extractPdfLines(bytes) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    // pdf.js transfers `data` to its worker (detaching the buffer), so it gets a copy.
    doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
  } catch (error) {
    if (error?.name === 'PasswordException') throw new Error('הקובץ מוגן בסיסמה. פתחו אותו, שמרו עותק בלי סיסמה ונסו שוב.');
    throw new Error('לא הצלחנו לפתוח את קובץ ה-PDF.');
  }
  try {
    const lines = [];
    const pages = Math.min(doc.numPages, PDF_LIMITS.maxPages);
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      lines.push(...groupTextItems(content.items));
      page.cleanup();
    }
    return { lines, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

/** PDF bytes → the same shape as readImportFile() for CSV, so the dialog treats both alike. */
export async function readPdfStatement(bytes) {
  if (bytes.byteLength > PDF_LIMITS.maxBytes) throw new Error('הקובץ גדול מדי (עד 15MB).');
  const { lines, pages } = await extractPdfLines(bytes);
  if (!lines.length) throw new Error('לא נמצא טקסט בקובץ. נראה שזה PDF סרוק (תמונה) — הורידו מאתר הבנק קובץ CSV או PDF מקורי.');
  const { headers, rows: dataRows } = rowsFromPdfLines(lines);
  if (!dataRows.length) throw new Error('לא זיהינו בקובץ טבלת תנועות (תאריך וסכום בכל שורה). נסו לייצא CSV מאתר הבנק.');
  const rows = [headers, ...dataRows];
  const mapping = guessMapping(headers);
  return { encoding: 'pdf', delimiter: null, pages, rows, headerIndex: 0, headers, mapping, positiveIs: guessPositiveIs(rows, 0, mapping) };
}
