import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LogIn, Mail, MailCheck, UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Logo from '../../components/ui/Logo.jsx';
import { ToastStack, useToasts } from '../../components/ui/Toast.jsx';
import { useAuth } from '../../state/AuthContext.jsx';
import { BACK_PRIORITY, useBackHandler } from '../../hooks/useBackHandler.js';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const COPY = {
  signin: { title: 'התחברות', subtitle: 'ברוכים השבים! התחברו כדי להמשיך לתוכנית שלכם.', submit: 'התחברות', icon: LogIn },
  signup: { title: 'יצירת חשבון', subtitle: 'החשבון שומר את הנתונים שלכם בענן ומסנכרן בין המכשירים.', submit: 'יצירת חשבון', icon: UserPlus },
  forgot: { title: 'איפוס סיסמה', subtitle: 'נשלח אליכם קישור לבחירת סיסמה חדשה.', submit: 'שליחת קישור', icon: Mail },
  recovery: { title: 'סיסמה חדשה', subtitle: 'בחרו סיסמה חדשה לחשבון.', submit: 'שמירת הסיסמה', icon: KeyRound },
};

const TABS = [
  { mode: 'signin', label: 'התחברות' },
  { mode: 'signup', label: 'הרשמה' },
  { mode: 'forgot', label: 'שכחתי סיסמה' },
];

// Toast headline per backend error code; the body is the backend's own Hebrew message.
const ERROR_TITLES = {
  invalid_credentials: 'ההתחברות נכשלה',
  email_not_confirmed: 'האימייל עדיין לא אומת',
  user_already_exists: 'החשבון כבר קיים',
  email_exists: 'החשבון כבר קיים',
  network: 'אין חיבור',
  provider_disabled: 'Google לא זמין כרגע',
  access_denied: 'ההתחברות בוטלה',
  oauth_failed: 'ההתחברות עם Google נכשלה',
};

const errorToast = (error, fallback = 'משהו השתבש. נסו שוב.') => ({
  tone: 'error',
  title: ERROR_TITLES[error?.code] ?? 'משהו השתבש',
  body: error?.message ?? fallback,
});

function oauthMessage(code) {
  if (code === 'access_denied') return 'ביטלתם את ההתחברות ב-Google. אפשר לנסות שוב או להתחבר עם אימייל.';
  return 'Google לא השלים את ההתחברות. נסו שוב, או התחברו עם אימייל וסיסמה.';
}

function validate(mode, { email, password, confirm }) {
  const errors = {};
  if (mode !== 'recovery') {
    if (!email.trim()) errors.email = 'נא להזין אימייל.';
    else if (!EMAIL_RE.test(email.trim())) errors.email = 'כתובת האימייל לא תקינה.';
  }
  if (mode === 'signin' && !password) errors.password = 'נא להזין סיסמה.';
  if (mode === 'signup' || mode === 'recovery') {
    if (password.length < MIN_PASSWORD) errors.password = `לפחות ${MIN_PASSWORD} תווים.`;
    else if (!/\d/.test(password) || !/[^\d]/.test(password)) errors.password = 'שלבו אותיות ומספרים.';
    if (confirm !== password) errors.confirm = 'הסיסמאות לא תואמות.';
  }
  return errors;
}

/** 0–3: long enough, letters + digits, then a symbol or 12+ characters. */
export function passwordStrength(password) {
  if (!password || password.length < MIN_PASSWORD) return password ? 1 : 0;
  let score = 1;
  if (/\d/.test(password) && /\p{L}/u.test(password)) score = 2;
  if (score === 2 && (/[^\p{L}\d]/u.test(password) || password.length >= 12)) score = 3;
  return score;
}

/** Login / sign-up / forgot-password / set-new-password, plus Google OAuth. Hebrew, RTL, mobile-first. */
export default function AuthScreen({ initialMode = 'signin' }) {
  const { backend, signIn, signUp, signInWithGoogle, requestPasswordReset, updatePassword, resendConfirmation, callbackNotice, dismissCallbackNotice } =
    useAuth();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [mode, setMode] = useState(initialMode);
  const [fields, setFields] = useState({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false); // sign-in said "email not confirmed"
  const [resend, setResend] = useState('idle'); // 'idle' | 'sending' | 'sent'
  const copy = COPY[mode];
  const linkProblem = callbackNotice?.kind === 'error' && callbackNotice.via !== 'oauth' ? callbackNotice : null;

  // Came back from Google with an error (cancelled, provider failure): say so once, as a toast.
  useEffect(() => {
    if (callbackNotice?.kind !== 'error' || callbackNotice.via !== 'oauth') return;
    pushToast(errorToast({ code: callbackNotice.code, message: oauthMessage(callbackNotice.code) }));
    dismissCallbackNotice();
  }, [callbackNotice, dismissCallbackNotice, pushToast]);

  const sendConfirmation = async () => {
    const email = (notice?.email ?? fields.email).trim();
    if (!EMAIL_RE.test(email)) {
      setErrors((prev) => ({ ...prev, email: 'הזינו את האימייל שאיתו נרשמתם.' }));
      document.getElementById('auth-email')?.focus();
      return;
    }
    setResend('sending');
    try {
      await resendConfirmation(email);
      setResend('sent');
      pushToast({ tone: 'success', title: 'נשלח קישור אימות חדש', body: `בדקו את תיבת הדואר של ${email}.` });
    } catch (error) {
      setResend('idle');
      pushToast(errorToast(error, 'שליחת המייל נכשלה. נסו שוב.'));
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setNotice(null);
    setUnconfirmed(false);
    setResend('idle');
    setFields((prev) => ({ ...prev, password: '', confirm: '' }));
  };

  useBackHandler(() => switchMode('signin'), { enabled: mode === 'signup' || mode === 'forgot', priority: BACK_PRIORITY.screen });

  const set = (key) => (event) => {
    const { value } = event.target;
    setFields((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Validate a field when the user leaves it; an empty field is only flagged on submit.
  const check = (key) => () => {
    if (!fields[key]) return;
    setErrors((prev) => ({ ...prev, [key]: validate(mode, fields)[key] }));
  };

  const continueWithGoogle = async () => {
    if (googleBusy || busy) return;
    setGoogleBusy(true);
    try {
      await signInWithGoogle(); // navigates away to Google on success
    } catch (error) {
      setGoogleBusy(false);
      pushToast(errorToast(error));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || googleBusy) return;
    const found = validate(mode, fields);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      document.getElementById(`auth-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(fields.email, fields.password);
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(fields.email, fields.password);
        if (needsConfirmation) {
          setNotice({
            title: 'כמעט סיימנו!',
            body: `שלחנו קישור אימות ל-${fields.email.trim()}. לחצו עליו כדי להיכנס. אם הקישור נפתח בדפדפן אחר או מחוץ לאפליקציה המותקנת — חזרו לכאן והתחברו עם האימייל והסיסמה.`,
            email: fields.email.trim(),
            canResend: true,
          });
        }
      } else if (mode === 'forgot') {
        await requestPasswordReset(fields.email);
        setNotice({ title: 'בדקו את תיבת הדואר', body: 'אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס הסיסמה.' });
      } else {
        await updatePassword(fields.password);
        pushToast({ tone: 'success', title: 'הסיסמה עודכנה' });
      }
    } catch (error) {
      pushToast(errorToast(error));
      setUnconfirmed(mode === 'signin' && error?.code === 'email_not_confirmed');
    } finally {
      setBusy(false);
    }
  };

  const Icon = copy.icon;
  const showGoogle = Boolean(signInWithGoogle) && (mode === 'signin' || mode === 'signup');
  const strength = mode === 'signup' || mode === 'recovery' ? passwordStrength(fields.password) : 0;

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] safe-x sm:px-8">
      {/* Soft brand glow behind the card; decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-turquoise/15 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 h-[24rem] w-[24rem] rounded-full bg-mint/10 blur-3xl" />
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6">
        <div className="mb-6 flex justify-center">
          <Logo size={36} />
        </div>
        <Card padding="p-6 sm:p-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={notice ? 'notice' : mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {notice ? (
                <div className="text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/20 text-turquoise-dark">
                    <MailCheck size={26} />
                  </span>
                  <h1 className="mt-4 text-2xl font-extrabold text-navy">{notice.title}</h1>
                  <p className="mt-2 leading-relaxed text-navy-soft">{notice.body}</p>
                  {notice.canResend && <ResendButton state={resend} onClick={sendConfirmation} className="mt-5 w-full" />}
                  <Button variant="secondary" className="mt-3 w-full" onClick={() => switchMode('signin')}>
                    חזרה להתחברות
                  </Button>
                </div>
              ) : (
                <form noValidate onSubmit={submit}>
                  {mode !== 'recovery' && <ModeTabs mode={mode} onChange={switchMode} />}
                  <div className={`flex items-center gap-3 ${mode !== 'recovery' ? 'mt-6' : ''}`}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white shadow-[var(--shadow-glow)]">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h1 className="text-2xl font-extrabold tracking-tight text-navy">{copy.title}</h1>
                      <p className="text-sm text-navy-soft">{copy.subtitle}</p>
                    </div>
                  </div>

                  {linkProblem && mode === 'signin' && (
                    <div role="alert" className="mt-5 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-bold">{linkProblem.code === 'link_other_browser' ? 'הקישור נפתח בדפדפן אחר' : 'קישור האימות כבר נוצל או פג תוקף'}</p>
                      <p className="mt-1 leading-relaxed">
                        {linkProblem.code === 'link_other_browser'
                          ? 'פתחו את הקישור באותו מכשיר ודפדפן שבו נרשמתם — או פשוט התחברו כאן.'
                          : 'לפעמים תוכנת המייל פותחת את הקישור לפניכם, ואז החשבון כבר מאומת: נסו פשוט להתחבר. אם תתבקשו לאמת שוב — הזינו את האימייל ושלחו קישור חדש.'}
                      </p>
                      <button type="button" onClick={dismissCallbackNotice} className="mt-1 inline-flex min-h-12 items-center font-bold underline-offset-4 hover:underline">
                        הבנתי
                      </button>
                    </div>
                  )}

                  {showGoogle && (
                    <>
                      <GoogleButton busy={googleBusy} disabled={busy} onClick={continueWithGoogle} className="mt-6" />
                      <div className="mt-5 flex items-center gap-3 text-xs font-semibold text-navy/40">
                        <span className="h-px flex-1 bg-navy/10" />
                        או עם אימייל
                        <span className="h-px flex-1 bg-navy/10" />
                      </div>
                    </>
                  )}

                  <div className={`${showGoogle ? 'mt-5' : 'mt-6'} space-y-4`}>
                    {mode !== 'recovery' && (
                      <Field
                        id="auth-email"
                        label="אימייל"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        value={fields.email}
                        onChange={set('email')}
                        onBlur={check('email')}
                        error={errors.email}
                      />
                    )}
                    {mode !== 'forgot' && (
                      <Field
                        id="auth-password"
                        label={mode === 'signin' ? 'סיסמה' : 'סיסמה חדשה'}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        dir="ltr"
                        value={fields.password}
                        onChange={set('password')}
                        onBlur={check('password')}
                        error={errors.password}
                        hint={strength ? <StrengthMeter score={strength} /> : null}
                        trailing={
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                            className="grid h-12 w-12 shrink-0 place-items-center text-navy/40 hover:text-navy"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        }
                      />
                    )}
                    {(mode === 'signup' || mode === 'recovery') && (
                      <Field
                        id="auth-confirm"
                        label="אימות סיסמה"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        dir="ltr"
                        value={fields.confirm}
                        onChange={set('confirm')}
                        onBlur={check('confirm')}
                        error={errors.confirm}
                      />
                    )}
                  </div>

                  {(unconfirmed || (linkProblem && mode === 'signin')) && (
                    <ResendButton state={resend} onClick={sendConfirmation} className="mt-4 w-full" />
                  )}

                  <Button type="submit" className="mt-5 w-full" disabled={busy || googleBusy} aria-busy={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                    {copy.submit}
                  </Button>

                  {mode === 'signup' && (
                    <p className="mt-4 text-center text-xs leading-relaxed text-navy-soft">הנתונים שלכם נשמרים בחשבון שלכם בלבד ומסונכרנים בין המכשירים.</p>
                  )}
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
        {backend?.kind === 'local' && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs leading-relaxed text-amber-800">
            מצב פיתוח מקומי: Supabase לא מוגדר, ולכן החשבונות נשמרים בדפדפן הזה בלבד.
          </p>
        )}
      </div>
    </div>
  );
}

function ModeTabs({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="סוג פעולה" className="grid grid-cols-3 rounded-2xl bg-mist p-1">
      {TABS.map((tab) => {
        const active = tab.mode === mode;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !active && onChange(tab.mode)}
            className={`relative min-h-11 rounded-xl px-2 text-sm font-bold transition-colors ${active ? 'text-navy' : 'text-navy-soft hover:text-navy'}`}
          >
            {active && (
              <motion.span
                layoutId="auth-tab"
                transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                className="absolute inset-0 rounded-xl bg-surface shadow-[var(--shadow-soft)]"
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GoogleButton({ busy, disabled, onClick, className = '' }) {
  const inactive = busy || disabled;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={inactive}
      aria-busy={busy}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      className={`flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border-2 border-navy/10 bg-surface px-4 text-base font-bold text-navy transition-colors hover:border-navy/20 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 size={20} className="animate-spin text-navy-soft" /> : <GoogleMark />}
      {busy ? 'מעבירים אתכם ל-Google…' : 'המשך עם Google'}
    </motion.button>
  );
}

/** The multi-colour Google "G" from Google's sign-in branding guidelines. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const STRENGTH = [
  null,
  { label: 'חלשה', className: 'bg-danger' },
  { label: 'בינונית', className: 'bg-amber-400' },
  { label: 'חזקה', className: 'bg-mint' },
];

function StrengthMeter({ score }) {
  const level = STRENGTH[score];
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span key={step} className={`h-1.5 flex-1 rounded-full transition-colors ${step <= score ? level.className : 'bg-navy/10'}`} />
        ))}
      </div>
      <span className="text-xs font-semibold text-navy-soft">סיסמה {level.label}</span>
    </div>
  );
}

function ResendButton({ state, onClick, className = '' }) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={state !== 'idle'} className={className}>
      {state === 'sending' ? <Loader2 size={18} className="animate-spin" /> : <MailCheck size={18} />}
      {state === 'sent' ? 'נשלח! בדקו את תיבת הדואר' : 'שליחת קישור אימות חדש'}
    </Button>
  );
}

function Field({ id, label, error, trailing, hint, ...inputProps }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-navy">
        {label}
      </label>
      <div
        className={`flex items-center rounded-2xl border-2 bg-surface transition-colors focus-within:ring-4 ${
          error ? 'border-danger/70 focus-within:ring-danger/10' : 'border-navy/10 focus-within:border-turquoise focus-within:ring-turquoise/15'
        }`}
      >
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="min-h-12 w-full min-w-0 bg-transparent px-4 text-base font-medium text-navy outline-none"
          {...inputProps}
        />
        {trailing}
      </div>
      {!error && hint}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
