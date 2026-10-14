import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../pwa/useInstallPrompt.js';

const DISMISS_KEY = 'aurafin_install_dismissed_at';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const IOS_HINT_DELAY_MS = 2500;

function recentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the banner just reappears next visit.
  }
}

/**
 * In-app install banner. On Chrome/Edge/Android it triggers the captured native prompt; on iOS
 * Safari (no prompt API) it explains Share → "Add to Home Screen". Hidden once installed.
 */
export default function InstallBanner() {
  const { canPrompt, installed, needsIOSInstructions, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(recentlyDismissed);
  const [iosReady, setIosReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needsIOSInstructions) return undefined;
    const timer = setTimeout(() => setIosReady(true), IOS_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [needsIOSInstructions]);

  const visible = !installed && !dismissed && (canPrompt || (needsIOSInstructions && iosReady));

  const dismiss = () => {
    rememberDismissal();
    setDismissed(true);
  };

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'dismissed') dismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="install-banner"
          role="dialog"
          aria-label="התקנת האפליקציה"
          initial={{ opacity: 0, y: -24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed inset-x-4 top-4 z-[90] sm:inset-x-auto sm:top-auto sm:bottom-6 sm:start-6 sm:w-[360px]"
        >
          <div className="relative overflow-hidden rounded-3xl border border-turquoise/30 bg-white p-4 shadow-[0_2px_6px_rgb(0_33_71/0.06),0_24px_56px_-16px_rgb(0_33_71/0.28)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-turquoise to-mint" />
            <button
              type="button"
              onClick={dismiss}
              aria-label="לא עכשיו"
              className="absolute end-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-navy/40 transition-colors hover:bg-mist hover:text-navy"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 pe-7">
              <img
                src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
                alt=""
                width="44"
                height="44"
                className="h-11 w-11 shrink-0 rounded-2xl shadow-[0_8px_20px_-8px_rgb(0_196_204/0.6)]"
              />
              <div className="min-w-0">
                <p className="font-extrabold text-navy">התקינו את AuraFin</p>
                <p className="text-sm leading-snug text-navy-soft">
                  {canPrompt ? 'גישה מהירה ממסך הבית, גם בלי חיבור.' : 'כך מוסיפים את האפליקציה למסך הבית:'}
                </p>
              </div>
            </div>

            {canPrompt ? (
              <motion.button
                type="button"
                onClick={install}
                disabled={busy}
                whileTap={{ scale: 0.96 }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-turquoise to-mint px-5 py-3 font-bold text-white shadow-[0_12px_28px_-10px_rgb(0_196_204/0.65)] disabled:opacity-80"
              >
                <Download size={17} /> התקנת האפליקציה
              </motion.button>
            ) : (
              <ol className="mt-3 space-y-2 rounded-2xl bg-mist p-3 text-sm text-navy">
                <li className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white font-bold text-turquoise-dark">1</span>
                  לוחצים על <Share size={16} className="text-royal" aria-label="שיתוף" /> בסרגל של Safari
                </li>
                <li className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white font-bold text-turquoise-dark">2</span>
                  בוחרים <SquarePlus size={16} className="text-royal" aria-hidden="true" /> „הוספה למסך הבית"
                </li>
              </ol>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
