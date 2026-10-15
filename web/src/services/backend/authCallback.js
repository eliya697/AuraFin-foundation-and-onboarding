/**
 * What an email link (sign-up confirmation, password reset, magic link) brought back in the URL.
 *
 * Supabase can land on the app in three shapes:
 *   #access_token=…&refresh_token=…&type=signup     implicit flow (supabase-js handles it)
 *   ?token_hash=…&type=signup|email|recovery       custom email template → we call verifyOtp()
 *   #error=…&error_code=otp_expired&error_description=…   the link was already used or expired —
 *        typically because a mail scanner or in-app browser opened it before the user did.
 *
 * It is captured once, at startup, before anything can rewrite the URL. `clearAuthParams()`
 * removes the one-time parameters afterwards so a reload or a shared link never replays them.
 */

const OTP_TYPES = new Set(['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change']);

export function parseAuthCallback(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const get = (key) => hash.get(key) ?? query.get(key);

  const errorCode = get('error_code') || get('error');
  if (errorCode) {
    return { kind: 'error', code: errorCode, description: get('error_description') ?? '', type: get('type') };
  }
  const tokenHash = query.get('token_hash');
  const type = get('type');
  if (tokenHash && OTP_TYPES.has(type)) return { kind: 'token_hash', tokenHash, type };
  if (hash.get('access_token')) return { kind: 'tokens', type };
  if (query.get('code')) return { kind: 'code', code: query.get('code'), type };
  return null;
}

const AUTH_PARAMS = ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token', 'provider_refresh_token', 'type', 'token_hash', 'code', 'error', 'error_code', 'error_description', 'sb'];

/** The current URL without one-time auth parameters (hash and query). */
export function stripAuthParams(href) {
  const url = new URL(href);
  for (const key of AUTH_PARAMS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (AUTH_PARAMS.some((key) => hash.has(key))) url.hash = '';
  return url.toString();
}

export function clearAuthParams() {
  const clean = stripAuthParams(window.location.href);
  if (clean !== window.location.href) window.history.replaceState(window.history.state, '', clean);
}

// Captured at module load (imported from main.jsx before React or Supabase run).
const initial = typeof window === 'undefined' ? null : parseAuthCallback(window.location.href);

export function initialAuthCallback() {
  return initial;
}
