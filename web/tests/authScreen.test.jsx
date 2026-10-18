import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthScreen, { passwordStrength } from '../src/features/auth/AuthScreen.jsx';
import { AuthProvider } from '../src/state/AuthContext.jsx';
import { BackendError } from '../src/services/backend/errors.js';
import { markPendingOAuth, takePendingOAuth } from '../src/services/backend/authCallback.js';

function fakeBackend(overrides = {}) {
  return {
    kind: 'supabase',
    getUser: async () => null,
    onAuthChange(cb) {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return () => {};
    },
    getAccessToken: async () => null,
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => ({ needsConfirmation: true })),
    signInWithOAuth: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    resendConfirmation: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    ...overrides,
  };
}

async function renderAuth(backend) {
  render(
    <AuthProvider backendLoader={async () => backend}>
      <AuthScreen />
    </AuthProvider>,
  );
  await screen.findByRole('tablist');
}

describe('AuthScreen', () => {
  test('tabs switch between sign in, sign up and forgot password', async () => {
    await renderAuth(fakeBackend());
    expect(screen.getByRole('tab', { name: 'התחברות' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'הרשמה' }));
    expect(await screen.findByLabelText('אימות סיסמה')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'שכחתי סיסמה' }));
    expect(await screen.findByRole('button', { name: /שליחת קישור/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
  });

  test('"Continue with Google" starts the Google OAuth flow', async () => {
    const backend = fakeBackend();
    await renderAuth(backend);
    fireEvent.click(screen.getByRole('button', { name: 'המשך עם Google' }));
    await waitFor(() => expect(backend.signInWithOAuth).toHaveBeenCalledWith('google'));
    expect(screen.getByRole('button', { name: /מעבירים אתכם ל-Google/ }).disabled).toBe(true);
  });

  test('a disabled Google provider is explained in a toast and the button recovers', async () => {
    const backend = fakeBackend({
      signInWithOAuth: vi.fn(async () => {
        throw new BackendError('ההתחברות עם Google עדיין לא הופעלה.', { code: 'provider_disabled' });
      }),
    });
    await renderAuth(backend);
    fireEvent.click(screen.getByRole('button', { name: 'המשך עם Google' }));
    expect(await screen.findByText('Google לא זמין כרגע')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'המשך עם Google' }).disabled).toBe(false);
  });

  test('the local dev backend has no Google button', async () => {
    const { signInWithOAuth, ...local } = fakeBackend();
    await renderAuth({ ...local, kind: 'local' });
    expect(signInWithOAuth).toBeTypeOf('function');
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
  });

  test('invalid credentials show an error toast', async () => {
    const backend = fakeBackend({
      signIn: vi.fn(async () => {
        throw new BackendError('האימייל או הסיסמה שגויים.', { code: 'invalid_credentials' });
      }),
    });
    await renderAuth(backend);
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'wrong-pass1' } });
    fireEvent.submit(screen.getByLabelText('אימייל').closest('form'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('ההתחברות נכשלה');
    expect(alert.textContent).toContain('האימייל או הסיסמה שגויים.');
  });

  test('an unconfirmed email offers to resend the confirmation link', async () => {
    const backend = fakeBackend({
      signIn: vi.fn(async () => {
        throw new BackendError('צריך לאשר את כתובת האימייל.', { code: 'email_not_confirmed' });
      }),
    });
    await renderAuth(backend);
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'secret123' } });
    fireEvent.submit(screen.getByLabelText('אימייל').closest('form'));
    fireEvent.click(await screen.findByRole('button', { name: 'שליחת קישור אימות חדש' }));
    await waitFor(() => expect(backend.resendConfirmation).toHaveBeenCalledWith('a@example.com'));
  });

  test('fields are validated on blur', async () => {
    await renderAuth(fakeBackend());
    const email = screen.getByLabelText('אימייל');
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.blur(email);
    expect(await screen.findByText('כתובת האימייל לא תקינה.')).toBeTruthy();
    expect(email.getAttribute('aria-invalid')).toBe('true');
  });

  test('an OAuth error on return is shown as a toast, not as an expired email link', async () => {
    const backend = fakeBackend({ callbackResult: async () => ({ kind: 'error', code: 'access_denied', via: 'oauth', provider: 'google' }) });
    await renderAuth(backend);
    expect(await screen.findByText('ההתחברות בוטלה')).toBeTruthy();
    expect(screen.queryByText('קישור האימות כבר נוצל או פג תוקף')).toBeNull();
  });
});

describe('passwordStrength', () => {
  test('scores length, letters + digits, then symbols', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('abcdefg1!')).toBe(3);
    expect(passwordStrength('סיסמהארוכה12')).toBe(3);
  });
});

describe('pending OAuth flag', () => {
  test('is read once', () => {
    markPendingOAuth('google');
    expect(takePendingOAuth()).toBe('google');
    expect(takePendingOAuth()).toBeNull();
  });

  test('expires after a few minutes', () => {
    markPendingOAuth('google');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
    expect(takePendingOAuth()).toBeNull();
  });
});
