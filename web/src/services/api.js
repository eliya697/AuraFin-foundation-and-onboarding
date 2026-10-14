/**
 * API client with an offline fallback.
 *
 * - VITE_API_URL set      → requests go to that backend (e.g. a hosted FastAPI).
 * - Dev server            → same-origin `/api`, proxied to :8000 by Vite.
 * - Static build, no URL  → there is no backend (GitHub Pages would answer POSTs with 405),
 *                           so calls fail fast with OfflineError and the UI runs locally.
 *
 * OfflineError is raised only when the backend is absent or unreachable. A real validation
 * error (422) or an error reported by our API is never downgraded to offline.
 */

const CONFIGURED_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const hasBackend = Boolean(CONFIGURED_BASE) || import.meta.env.DEV;

const OFFLINE_STATUSES = new Set([404, 405, 501, 502, 503, 504]);
const TIMEOUTS = { gate: 10_000, plan: 120_000 };

export class ApiError extends Error {
  constructor(message, { status = 0, fields = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

export class OfflineError extends ApiError {
  constructor(reason, status = 0) {
    super('השרת לא זמין כרגע — ממשיכים במצב לא מקוון.', { status });
    this.name = 'OfflineError';
    this.reason = reason;
  }
}

function withTimeout(signal, ms) {
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

/** Our FastAPI always answers errors with JSON carrying `detail` or `error`. */
function isOurApiError(data) {
  return Boolean(data && typeof data === 'object' && ('detail' in data || 'error' in data));
}

async function post(path, body, { signal, timeoutMs }) {
  if (!hasBackend) throw new OfflineError('no_backend');

  let response;
  try {
    response = await fetch(`${CONFIGURED_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: withTimeout(signal, timeoutMs),
    });
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled by the caller
    throw new OfflineError(error.name === 'TimeoutError' ? 'timeout' : 'network');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body (e.g. a static host's HTML error page).
  }

  if (response.ok) return data;

  if (response.status === 422 && data?.fields) {
    throw new ApiError(data.message, { status: 422, fields: data.fields });
  }
  if (OFFLINE_STATUSES.has(response.status) && !isOurApiError(data)) {
    throw new OfflineError(`http_${response.status}`, response.status);
  }
  const message = typeof data?.detail === 'string' ? data.detail : `שגיאת שרת (${response.status}). נסו שוב.`;
  throw new ApiError(message, { status: response.status });
}

/** The server-side gate: resolves only when the snapshot is complete and valid. */
export function validateGate(snapshot, signal) {
  return post('/api/gate/validate', snapshot, { signal, timeoutMs: TIMEOUTS.gate });
}

export function fetchSavingsPlan(snapshot, signal) {
  return post('/api/coach/plan', snapshot, { signal, timeoutMs: TIMEOUTS.plan });
}
