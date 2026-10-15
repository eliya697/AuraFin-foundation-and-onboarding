import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseAuthCallback, stripAuthParams } from '../src/services/backend/authCallback.js';

const APP = 'https://eliya697.github.io/AuraFin-foundation-and-onboarding/';

describe('parseAuthCallback', () => {
  test('implicit-flow confirmation tokens in the hash', () => {
    expect(parseAuthCallback(`${APP}#access_token=a&refresh_token=b&expires_in=3600&type=signup`)).toEqual({ kind: 'tokens', type: 'signup' });
  });

  test('token_hash link from a custom email template', () => {
    expect(parseAuthCallback(`${APP}?token_hash=abc123&type=email`)).toEqual({ kind: 'token_hash', tokenHash: 'abc123', type: 'email' });
  });

  test('expired / already used link (mail scanners open links first)', () => {
    const result = parseAuthCallback(`${APP}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(result).toMatchObject({ kind: 'error', code: 'otp_expired', description: 'Email link is invalid or has expired' });
  });

  test('PKCE code in the query', () => {
    expect(parseAuthCallback(`${APP}?code=xyz`)).toMatchObject({ kind: 'code', code: 'xyz' });
  });

  test('plain app URL and unrelated hashes are ignored', () => {
    expect(parseAuthCallback(APP)).toBeNull();
    expect(parseAuthCallback(`${APP}#section`)).toBeNull();
    expect(parseAuthCallback(`${APP}?token_hash=abc&type=unknown`)).toBeNull();
  });
});

describe('stripAuthParams', () => {
  test('removes one-time tokens but keeps the app path and other params', () => {
    expect(stripAuthParams(`${APP}#access_token=a&type=signup`)).toBe(APP);
    expect(stripAuthParams(`${APP}?token_hash=abc&type=email&utm=x`)).toBe(`${APP}?utm=x`);
    expect(stripAuthParams(`${APP}#section`)).toBe(`${APP}#section`);
  });
});

describe('Supabase backend email-link handling', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@supabase/supabase-js');
    window.history.replaceState(null, '', '/');
  });

  async function backendFor(url, authOverrides = {}) {
    // authCallback.js reads the URL when first imported, so load a fresh copy after setting it.
    vi.resetModules();
    window.history.replaceState(null, '', url);
    const listeners = [];
    let current = null;
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: current } })),
      verifyOtp: vi.fn(async () => {
        const session = { user: { id: 'u1', email: 'new@example.com', email_confirmed_at: '2026-10-15' } };
        current = session;
        listeners.forEach((cb) => cb('SIGNED_IN', session));
        return { data: { session }, error: null };
      }),
      onAuthStateChange: vi.fn((cb) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      }),
      resend: vi.fn(async () => ({ data: {}, error: null })),
      ...authOverrides,
    };
    const roles = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'user', suspended: false }, error: null }) }) }) };
    vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth, from: () => roles })) }));
    const { createSupabaseBackend } = await import('../src/services/backend/supabaseBackend.js');
    return { backend: createSupabaseBackend('https://abc.supabase.co', 'key'), auth };
  }

  test('a token_hash link is verified, signs the user in and is removed from the URL', async () => {
    const { backend, auth } = await backendFor('/?token_hash=abc123&type=email');
    const events = [];
    backend.onAuthChange((event, user) => events.push([event, user?.email]));
    await expect(backend.callbackResult()).resolves.toEqual({ kind: 'confirmed', type: 'email' });
    // Subscribed after the link was verified: the session is still delivered.
    await vi.waitFor(() => expect(events.at(-1)).toEqual(['INITIAL_SESSION', 'new@example.com']));
    expect(events.every(([, email]) => email === 'new@example.com')).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'email' });
    expect(window.location.search).toBe('');
  });

  test('an expired link is reported (not silently dropped) and cleaned from the URL', async () => {
    const { backend } = await backendFor('/#error=access_denied&error_code=otp_expired&error_description=expired');
    await expect(backend.callbackResult()).resolves.toMatchObject({ kind: 'error', code: 'otp_expired' });
    expect(window.location.hash).toBe('');
  });

  test('resending the confirmation goes back to the app root', async () => {
    const { backend, auth } = await backendFor('/');
    await backend.resendConfirmation('new@example.com');
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'new@example.com', options: { emailRedirectTo: `${window.location.origin}/` } });
  });
});
