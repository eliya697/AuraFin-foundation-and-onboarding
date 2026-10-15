import { useSyncExternalStore } from 'react';

/**
 * Colour theme. The preference ('system' | 'light' | 'dark') is stored per device; the resolved
 * theme is written to <html data-theme>, which index.css uses to swap the colour tokens. The inline
 * script in index.html applies the same rule before first paint, so keep the two in sync.
 */
export const THEME_KEY = 'aurafin:theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];
/** Status-bar colours (<meta name="theme-color">), matching --color-surface per theme. */
export const THEME_COLORS = { light: '#ffffff', dark: '#13213a' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function normalizePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
}

export function resolveTheme(preference, systemDark) {
  const pref = normalizePreference(preference);
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** system → light → dark → system: the order the top-bar button cycles through. */
export function nextPreference(preference) {
  const i = THEME_PREFERENCES.indexOf(normalizePreference(preference));
  return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length];
}

export function applyTheme(theme, doc = document) {
  const root = doc.documentElement;
  root.dataset.theme = theme;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

/** Injectable for tests; the app uses the browser-backed default store below. */
export function createThemeStore({ storage, media, doc } = {}) {
  const listeners = new Set();
  const read = () => {
    try {
      return normalizePreference(storage?.getItem(THEME_KEY));
    } catch {
      return 'system';
    }
  };
  let preference = read();
  let systemDark = Boolean(media?.matches);
  let snapshot = { preference, theme: resolveTheme(preference, systemDark) };

  const update = () => {
    const theme = resolveTheme(preference, systemDark);
    if (snapshot.preference !== preference || snapshot.theme !== theme) snapshot = { preference, theme };
    if (doc) applyTheme(theme, doc);
    listeners.forEach((listener) => listener());
  };

  media?.addEventListener?.('change', (event) => {
    systemDark = event.matches;
    update();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPreference(next) {
      preference = normalizePreference(next);
      try {
        if (preference === 'system') storage?.removeItem(THEME_KEY);
        else storage?.setItem(THEME_KEY, preference);
      } catch {
        // Storage blocked (private mode): the choice still applies for this visit.
      }
      update();
    },
    /** Re-applies the current theme to the document (used once at start-up). */
    sync: update,
  };
}

function browserStore() {
  if (typeof window === 'undefined') return createThemeStore();
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    // ignore
  }
  const store = createThemeStore({ storage, media: window.matchMedia?.(DARK_QUERY), doc: document });
  store.sync();
  return store;
}

export const themeStore = browserStore();
const serverSnapshot = { preference: 'system', theme: 'light' };

/** { preference, theme, setPreference } — no provider needed. */
export function useTheme() {
  const { preference, theme } = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, () => serverSnapshot);
  return { preference, theme, setPreference: themeStore.setPreference };
}
