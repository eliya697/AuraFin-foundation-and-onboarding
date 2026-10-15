/**
 * Pure Supabase settings check, shared by the app (config.js) and the build (vite.config.js).
 * No `import.meta.env` here so it also runs in Node.
 */

function projectRefFromKey(key) {
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).ref ?? null;
  } catch {
    return null; // not a legacy JWT key (e.g. a newer "sb_publishable_…" key): nothing to compare
  }
}

/**
 * Returns a description of a broken Supabase configuration, or null. A typo in the project URL
 * makes every auth request fail with a bare network error (DNS lookup fails → net::ERR_FAILED),
 * so it is caught here and reported clearly instead.
 */
export function supabaseConfigProblem(url, key) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `VITE_SUPABASE_URL is not a valid URL: "${url}"`;
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return `VITE_SUPABASE_URL must use https: "${url}"`;
  }
  const hostRef = parsed.hostname.endsWith('.supabase.co') ? parsed.hostname.split('.')[0] : null;
  const keyRef = projectRefFromKey(key);
  if (hostRef && keyRef && hostRef !== keyRef) {
    return `VITE_SUPABASE_URL points to project "${hostRef}" but VITE_SUPABASE_ANON_KEY belongs to "${keyRef}". Copy the Project URL again from Supabase → Project Settings → API.`;
  }
  return null;
}
