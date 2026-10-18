/** A user-facing error from the auth/data backend. `message` is always Hebrew and safe to show. */
export class BackendError extends Error {
  constructor(message, { code = 'unknown', cause } = {}) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.cause = cause;
  }
}

const MESSAGES = {
  invalid_credentials: 'האימייל או הסיסמה שגויים.',
  email_not_confirmed: 'צריך לאשר את כתובת האימייל לפני ההתחברות — בדקו את תיבת הדואר.',
  user_already_exists: 'כבר קיים חשבון עם האימייל הזה. נסו להתחבר.',
  email_exists: 'כבר קיים חשבון עם האימייל הזה. נסו להתחבר.',
  weak_password: 'הסיסמה חלשה מדי. בחרו לפחות 8 תווים עם אותיות ומספרים.',
  same_password: 'הסיסמה החדשה זהה לסיסמה הנוכחית.',
  over_email_send_rate_limit: 'נשלחו יותר מדי מיילים. נסו שוב בעוד כמה דקות.',
  over_request_rate_limit: 'יותר מדי ניסיונות. נסו שוב בעוד דקה.',
  signup_disabled: 'ההרשמה סגורה כרגע.',
  user_banned: 'החשבון הזה הושעה. פנו למנהל המערכת.',
  session_not_found: 'פג תוקף החיבור. התחברו מחדש.',
  network: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.',
  otp_expired: 'קישור האימות פג תוקף או שכבר נעשה בו שימוש.',
  email_address_invalid: 'כתובת האימייל לא תקינה.',
  forbidden: 'אין לכם הרשאה לפעולה הזו.',
  provider_disabled: 'ההתחברות עם Google עדיין לא הופעלה. נסו להתחבר עם אימייל וסיסמה.',
  access_denied: 'ההתחברות עם Google בוטלה.',
  oauth_failed: 'ההתחברות עם Google לא הושלמה. נסו שוב.',
};

export function messageFor(code, fallback = 'משהו השתבש. נסו שוב.') {
  return MESSAGES[code] ?? fallback;
}

/** Normalises a Supabase (or fetch) error into a BackendError. */
export function toBackendError(error, fallback) {
  if (error instanceof BackendError) return error;
  const raw = error ?? {};
  let code = raw.code || raw.error_code || 'unknown';
  if (raw.name === 'AuthRetryableFetchError' || raw.name === 'TypeError' || raw.status === 0) code = 'network';
  if (raw.code === '42501') code = 'forbidden';
  return new BackendError(messageFor(code, fallback ?? raw.message ?? undefined), { code, cause: error });
}
