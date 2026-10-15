import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';

const COMMITS_URL = 'https://api.github.com/repos/eliya697/AuraFin-foundation-and-onboarding/commits/main';
const SHA_KEY = 'aurafin_latest_sha';
const NEXT_CHECK_KEY = 'aurafin_update_next_check';

// Unauthenticated GitHub API calls are limited to 60/hour per IP, so focus events are throttled.
const MIN_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const FALLBACK_BACKOFF_MS = 15 * 60 * 1000;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / blocked): update checks simply won't persist.
  }
}

/** Earliest time the next request may be sent; shared across tabs via localStorage. */
function scheduleNextCheck(delayMs) {
  writeStorage(NEXT_CHECK_KEY, String(Date.now() + delayMs));
}

function canCheckNow() {
  const next = Number(readStorage(NEXT_CHECK_KEY));
  return !Number.isFinite(next) || Date.now() >= next;
}

function rateLimitBackoff(response) {
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
  const retryAfter = Number(response.headers.get('retry-after')) * 1000;
  if (retryAfter > 0) return retryAfter;
  if (reset > Date.now()) return reset - Date.now() + 1000;
  return FALLBACK_BACKOFF_MS;
}

/**
 * Over-the-air update notice. Polls the latest commit on `main`; when it differs from the
 * SHA this browser last acknowledged, shows a toast offering an instant reload.
 */
export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latest, setLatest] = useState(null); // { sha, message }
  const [reloading, setReloading] = useState(false);
  const dismissedShaRef = useRef(null);
  const inFlightRef = useRef(null);

  const checkForUpdate = useCallback(async ({ force = false } = {}) => {
    if (inFlightRef.current || (!force && !canCheckNow())) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const controller = new AbortController();
    inFlightRef.current = controller;
    scheduleNextCheck(MIN_CHECK_INTERVAL_MS);

    try {
      const response = await fetch(COMMITS_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });

      if (response.status === 403 || response.status === 429) {
        scheduleNextCheck(rateLimitBackoff(response));
        return;
      }
      if (!response.ok) return;

      const data = await response.json();
      const sha = typeof data?.sha === 'string' ? data.sha : null;
      if (!sha) return;

      const storedSha = readStorage(SHA_KEY);
      if (!storedSha) {
        // First visit: this is the baseline version, nothing to announce.
        writeStorage(SHA_KEY, sha);
        return;
      }

      if (sha !== storedSha && sha !== dismissedShaRef.current) {
        const message = typeof data?.commit?.message === 'string' ? data.commit.message.split('\n')[0] : '';
        setLatest({ sha, message });
        setUpdateAvailable(true);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Network failure or GitHub outage: stay silent and retry on the next trigger.
        console.warn('[AuraFin] Update check failed:', error.message);
      }
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    checkForUpdate({ force: true });

    const onFocus = () => checkForUpdate();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') checkForUpdate();
    }, POLL_INTERVAL_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      // Release the lock synchronously so a remount (e.g. StrictMode) can check immediately.
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [checkForUpdate]);

  const updateNow = () => {
    setReloading(true);
    writeStorage(SHA_KEY, null);
    // `true` (forceGet) is honoured by Firefox; other browsers ignore the argument and do a normal reload.
    window.location.reload(true);
  };

  const dismiss = () => {
    dismissedShaRef.current = latest?.sha ?? null;
    setUpdateAvailable(false);
  };

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          key="update-toast"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="gpu bottom-overlay fixed inset-x-4 z-[100] sm:inset-x-auto sm:end-6 sm:w-[380px]"
        >
          <div className="relative overflow-hidden rounded-3xl border border-turquoise/30 bg-surface p-5 shadow-[0_2px_6px_rgb(0_33_71/0.06),0_24px_56px_-16px_rgb(0_33_71/0.28)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-turquoise to-mint" />

            <button
              type="button"
              onClick={dismiss}
              aria-label="סגירה, אעדכן מאוחר יותר"
              className="absolute end-1.5 top-1.5 grid h-12 w-12 place-items-center rounded-full text-navy/40 transition-colors hover:bg-mist hover:text-navy"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3.5 pe-6">
              <motion.span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-turquoise to-mint text-white shadow-[0_10px_24px_-8px_rgb(0_196_204/0.6)]"
                animate={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 1.2, delay: 0.4, repeat: 2, repeatDelay: 3.5 }}
              >
                <Sparkles size={20} />
              </motion.span>
              <div className="min-w-0">
                <p className="font-extrabold text-navy">גרסה חדשה של AuraFin זמינה</p>
                <p className="mt-0.5 text-sm leading-relaxed text-navy-soft">
                  שיפרנו כמה דברים מאחורי הקלעים. רעננו כדי לקבל את הגרסה העדכנית.
                </p>
                {latest?.message && (
                  <p className="mt-2 truncate rounded-xl bg-mist px-3 py-1.5 text-xs text-navy-soft" dir="auto" title={latest.message}>
                    {latest.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <motion.button
                type="button"
                onClick={updateNow}
                disabled={reloading}
                whileHover={reloading ? undefined : { y: -1 }}
                whileTap={reloading ? undefined : { scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-turquoise to-mint px-5 py-3 font-bold text-white shadow-[0_12px_28px_-10px_rgb(0_196_204/0.65)] transition-[filter] hover:brightness-105 disabled:cursor-wait disabled:opacity-80"
              >
                {reloading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                {reloading ? 'מעדכנים…' : 'עדכן עכשיו'}
              </motion.button>
              <button
                type="button"
                onClick={dismiss}
                className="min-h-12 rounded-2xl px-4 text-sm font-semibold text-navy-soft transition-colors hover:bg-mist hover:text-navy"
              >
                אחר כך
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
