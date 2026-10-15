import { useCallback, useSyncExternalStore } from 'react';
import { formatCurrency } from '../lib/budget.js';

/**
 * Privacy Eye: hides every monetary amount on screen (e.g. on a bus or a shared screen). The flag is
 * stored per device and mirrored to <html data-privacy> so CSS can dot out amount inputs that are not
 * being edited (index.css); displayed amounts go through useMoney(), which renders a mask instead.
 */
export const PRIVACY_KEY = 'aurafin:privacy';
export const MASK = '••••';
const MASKED_AMOUNT = `${MASK} ₪`;

// Amounts inside free text (AI plan markdown): "₪1,234", "1,234 ₪", "1,234.5 ש"ח".
// A leading "-" counts as a sign only when it is not a Hebrew prefix joiner ("ו-350 ₪").
// Intl output adds bidi marks around the number ("‏4,321 ‏₪"), hence [\s\p{Cf}]*.
const AMOUNT_IN_TEXT = /(?:(?<!\p{L})-|−)?\p{Cf}*(?:₪[\s\p{Cf}]*\d[\d,.]*|\d[\d,.]*[\s\p{Cf}]*(?:₪|ש"ח|ש״ח|שקלים|NIS|ILS))/gu;

export function maskAmountsInText(text) {
  return String(text ?? '').replace(AMOUNT_IN_TEXT, MASKED_AMOUNT);
}

export function createPrivacyStore({ storage, doc } = {}) {
  const listeners = new Set();
  let hidden = false;
  try {
    hidden = storage?.getItem(PRIVACY_KEY) === '1';
  } catch {
    // ignore
  }

  const apply = () => {
    if (!doc) return;
    if (hidden) doc.documentElement.dataset.privacy = '';
    else delete doc.documentElement.dataset.privacy;
  };

  const set = (next) => {
    hidden = Boolean(next);
    try {
      if (hidden) storage?.setItem(PRIVACY_KEY, '1');
      else storage?.removeItem(PRIVACY_KEY);
    } catch {
      // Storage blocked: still applies for this visit.
    }
    apply();
    listeners.forEach((listener) => listener());
  };

  apply();
  return {
    getSnapshot: () => hidden,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setHidden: set,
    toggle: () => set(!hidden),
  };
}

function browserStore() {
  if (typeof window === 'undefined') return createPrivacyStore();
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    // ignore
  }
  return createPrivacyStore({ storage, doc: document });
}

export const privacyStore = browserStore();

/** { hidden, toggle, setHidden } — no provider needed. */
export function usePrivacy() {
  const hidden = useSyncExternalStore(privacyStore.subscribe, privacyStore.getSnapshot, () => false);
  return { hidden, toggle: privacyStore.toggle, setHidden: privacyStore.setHidden };
}

/** Display formatter for amounts: formatCurrency, or a mask while the Privacy Eye is closed. */
export function useMoney() {
  const { hidden } = usePrivacy();
  return useCallback((value) => (hidden ? MASKED_AMOUNT : formatCurrency(value)), [hidden]);
}

/** For free text that may quote amounts (AI plan): masks them while the Privacy Eye is closed. */
export function useMaskText() {
  const { hidden } = usePrivacy();
  return useCallback((text) => (hidden ? maskAmountsInText(text) : text), [hidden]);
}
