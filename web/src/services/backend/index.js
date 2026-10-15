import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

/**
 * Resolves the auth/data backend:
 *   - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set → Supabase (production).
 *   - `vite dev` without them                         → a local, browser-only dev backend.
 *   - Production build without them                   → null: the app shows a setup screen and
 *                                                       nobody can reach the dashboard.
 * Both providers are loaded lazily so the initial bundle stays small.
 */
let pending = null;

export function loadBackend() {
  if (!pending) {
    pending = (async () => {
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        const { createSupabaseBackend } = await import('./supabaseBackend.js');
        return createSupabaseBackend(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
      if (import.meta.env.DEV) {
        const { createLocalBackend } = await import('./localBackend.js');
        return createLocalBackend();
      }
      return null;
    })();
  }
  return pending;
}

export { BackendError } from './errors.js';
