const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, fields = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function post(path, body, signal) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Empty or non-JSON body; handled below.
  }

  if (!response.ok) {
    if (response.status === 422 && data?.fields) {
      throw new ApiError(data.message, { status: 422, fields: data.fields });
    }
    const message = typeof data?.detail === 'string' ? data.detail : `שגיאת שרת (${response.status}). נסו שוב.`;
    throw new ApiError(message, { status: response.status });
  }
  return data;
}

/** The server-side gate: resolves only when the snapshot is complete and valid. */
export function validateGate(snapshot, signal) {
  return post('/api/gate/validate', snapshot, signal);
}

export function fetchSavingsPlan(snapshot, signal) {
  return post('/api/coach/plan', snapshot, signal);
}
