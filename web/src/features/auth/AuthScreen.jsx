import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, Loader2, LogIn, Mail, MailCheck, UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Logo from '../../components/ui/Logo.jsx';
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

/** Login / sign-up / forgot-password / set-new-password. Hebrew, RTL, mobile-first. */
export default function AuthScreen({ initialMode = 'signin' }) {
  const { backend, signIn, signUp, requestPasswordReset, updatePassword } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [fields, setFields] = useState({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const copy = COPY[mode];

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setFields((prev) => ({ ...prev, password: '', confirm: '' }));
  };

  useBackHandler(() => switchMode('signin'), { enabled: mode === 'signup' || mode === 'forgot', priority: BACK_PRIORITY.screen });

  const set = (key) => (event) => {
    const { value } = event.target;
    setFields((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const found = validate(mode, fields);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      document.getElementById(`auth-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (mode === 'signin') {
        await signIn(fields.email, fields.password);
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(fields.email, fields.password);
        if (needsConfirmation) setNotice({ title: 'כמעט סיימנו!', body: `שלחנו קישור אימות ל-${fields.email.trim()}. אשרו אותו ואז התחברו.` });
      } else if (mode === 'forgot') {
        await requestPasswordReset(fields.email);
        setNotice({ title: 'בדקו את תיבת הדואר', body: 'אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס הסיסמה.' });
      } else {
        await updatePassword(fields.password);
      }
    } catch (error) {
      setFormError(error?.message ?? 'משהו השתבש. נסו שוב.');
    } finally {
      setBusy(false);
    }
  };

  const Icon = copy.icon;

  return (
    <div className="flex min-h-dvh flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] safe-x sm:px-8">
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
                  <Button variant="secondary" className="mt-6 w-full" onClick={() => switchMode('signin')}>
                    חזרה להתחברות
                  </Button>
                </div>
              ) : (
                <form noValidate onSubmit={submit}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white shadow-[var(--shadow-glow)]">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h1 className="text-2xl font-extrabold tracking-tight text-navy">{copy.title}</h1>
                      <p className="text-sm text-navy-soft">{copy.subtitle}</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
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
                        error={errors.password}
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
                        error={errors.confirm}
                      />
                    )}
                  </div>

                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="mt-1 inline-flex min-h-12 items-center text-sm font-semibold text-turquoise-dark"
                    >
                      שכחתם סיסמה?
                    </button>
                  )}

                  {formError && (
                    <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/25 bg-danger/[0.05] p-3 text-sm font-medium text-danger">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      {formError}
                    </p>
                  )}

                  <Button type="submit" className="mt-5 w-full" disabled={busy}>
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                    {copy.submit}
                  </Button>

                  <div className="mt-4 text-center text-sm text-navy-soft">
                    {mode === 'signin' && (
                      <>
                        אין לכם חשבון?{' '}
                        <button type="button" onClick={() => switchMode('signup')} className="inline-flex min-h-12 items-center font-bold text-turquoise-dark">
                          הרשמה
                        </button>
                      </>
                    )}
                    {(mode === 'signup' || mode === 'forgot') && (
                      <button type="button" onClick={() => switchMode('signin')} className="inline-flex min-h-12 items-center gap-1 font-bold text-turquoise-dark">
                        <ArrowRight size={16} /> כבר יש לי חשבון
                      </button>
                    )}
                  </div>
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

function Field({ id, label, error, trailing, ...inputProps }) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-navy">
        {label}
      </label>
      <div
        className={`flex items-center rounded-2xl border-2 bg-white transition-colors focus-within:ring-4 ${
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
      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
