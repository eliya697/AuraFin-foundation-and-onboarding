/**
 * API client with an offline fallback.
 *
 * - VITE_API_URL set      → requests go to that backend (e.g. a hosted FastAPI).
 * - Dev server            → same-origin `/api`, proxied to :8000 by Vite.
 * - Static build, no URL  → there is no backend (GitHub Pages would answer POSTs with 405),
 *                           so calls fail fast with OfflineError and the UI runs locally.
 *
 * OfflineError is raised only when the backend is absent or unreachable. A real validation
 * error (422), an auth error (401/403) or an error reported by our API is never downgraded to offline.
 * Every request carries the signed-in user's access token (see AuthContext).
 */

const CONFIGURED_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const hasBackend = Boolean(CONFIGURED_BASE) || import.meta.env.DEV;

// Only when the body is not one of our JSON errors (e.g. a static host page, or the dev proxy with the API down).
const OFFLINE_STATUSES = new Set([404, 405, 500, 501, 502, 503, 504]);
// Free-tier hosts (e.g. Render) can take ~30 s to wake up; warmUp() hides most of that.
const TIMEOUTS = { gate: 30_000, plan: 120_000, health: 60_000 };

let tokenProvider = null;

/** fn: () => Promise<string | null>. Set by AuthProvider; null clears it. */
export function setAccessTokenProvider(fn) {
  tokenProvider = fn;
}

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

async function authHeaders() {
  try {
    const token = tokenProvider ? await tokenProvider() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request(path, { method = 'POST', body, signal, timeoutMs }) {
  if (!hasBackend) throw new OfflineError('no_backend');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError('device_offline');

  let response;
  try {
    response = await fetch(`${CONFIGURED_BASE}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(await authHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  return request('/api/gate/validate', { body: snapshot, signal, timeoutMs: TIMEOUTS.gate });
}

export function fetchSavingsPlan(snapshot, signal) {
  return request('/api/coach/plan', { body: snapshot, signal, timeoutMs: TIMEOUTS.plan });
}

let warmUpPromise = null;

/** Fire-and-forget wake-up call so a sleeping host is ready by the time the gate submits. */
export function warmUp() {
  if (!hasBackend || warmUpPromise) return warmUpPromise;
  warmUpPromise = request('/api/health', { method: 'GET', timeoutMs: TIMEOUTS.health })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      // Allow another attempt later (e.g. after coming back online).
      setTimeout(() => {
        warmUpPromise = null;
      }, 60_000);
    });
  return warmUpPromise;
}
