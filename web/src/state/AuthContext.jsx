import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadBackend } from '../services/backend/index.js';
import { setAccessTokenProvider } from '../services/api.js';

/**
 * Session state for the whole app.
 *   status: 'loading' | 'unconfigured' | 'signedOut' | 'signedIn'
 *   user:   { id, email, role: 'user' | 'admin', suspended, emailConfirmed } | null
 *   recovery: true after a password-reset link was opened (show "set a new password").
 */
const AuthContext = createContext(null);

export function AuthProvider({ children, backendLoader = loadBackend }) {
  const [backend, setBackend] = useState(null);
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [callbackNotice, setCallbackNotice] = useState(null); // outcome of the email link that opened the app

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    backendLoader()
      .then((instance) => {
        if (cancelled) return;
        if (!instance) {
          setStatus('unconfigured');
          return;
        }
        setBackend(instance);
        setAccessTokenProvider(() => instance.getAccessToken());
        instance.callbackResult?.().then((result) => {
          if (!cancelled && result?.kind === 'error') setCallbackNotice(result);
        });
        unsubscribe = instance.onAuthChange((event, nextUser) => {
          if (cancelled) return;
          if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          setUser((prev) => mergeUser(prev, nextUser));
          setStatus(nextUser ? 'signedIn' : 'signedOut');
        });
      })
      .catch((error) => {
        console.error('[AuraFin] Auth backend failed to load:', error);
        if (cancelled) return;
        if (error?.name === 'ConfigError') setConfigError(error.message);
        setStatus('unconfigured');
      });
    return () => {
      cancelled = true;
      unsubscribe();
      setAccessTokenProvider(null);
    };
  }, [backendLoader]);

  const refreshUser = useCallback(async () => {
    if (!backend) return;
    const next = await backend.getUser();
    setUser((prev) => mergeUser(prev, next));
    setStatus(next ? 'signedIn' : 'signedOut');
  }, [backend]);

  // Pick up role/suspension changes made by an admin when the app comes back to the foreground.
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUser().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status, refreshUser]);

  const value = useMemo(
    () => ({
      backend,
      status,
      user,
      recovery,
      configError,
      callbackNotice,
      dismissCallbackNotice: () => setCallbackNotice(null),
      resendConfirmation: (email) => backend.resendConfirmation(email.trim()),
      isAdmin: user?.role === 'admin' && !user?.suspended,
      signIn: (email, password) => backend.signIn(email.trim(), password),
      signUp: (email, password) => backend.signUp(email.trim(), password),
      // Only the Supabase backend can do OAuth; the dev-only local backend has no Google sign-in.
      signInWithGoogle: backend?.signInWithOAuth ? () => backend.signInWithOAuth('google') : null,
      requestPasswordReset: (email) => backend.requestPasswordReset(email.trim()),
      updatePassword: async (password) => {
        await backend.updatePassword(password);
        setRecovery(false);
      },
      signOut: () => backend.signOut(),
      refreshUser,
    }),
    [backend, status, user, recovery, configError, callbackNotice, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Keeps the previous object when nothing changed (TOKEN_REFRESHED fires hourly — no re-render), and
 * keeps the last known role/suspension when the backend could not read them (role === null).
 */
function mergeUser(prev, next) {
  if (!next) return null;
  const sameAccount = prev && prev.id === next.id;
  const resolved = {
    ...next,
    role: next.role ?? (sameAccount ? prev.role : 'user'),
    suspended: next.suspended ?? (sameAccount ? prev.suspended : false),
  };
  return sameAccount && sameUser(prev, resolved) ? prev : resolved;
}

function sameUser(a, b) {
  return a.id === b.id && a.email === b.email && a.role === b.role && a.suspended === b.suspended && a.emailConfirmed === b.emailConfirmed;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
