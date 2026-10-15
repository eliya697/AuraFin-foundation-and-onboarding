import { describe, expect, test } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { applyTheme, createThemeStore, nextPreference, resolveTheme, THEME_COLORS, THEME_KEY } from '../src/state/theme.js';
import { createPrivacyStore, maskAmountsInText, MASK, PRIVACY_KEY, privacyStore, useMoney } from '../src/state/privacy.js';
import { formatCurrency } from '../src/lib/budget.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

function fakeMedia(matches) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (_, cb) => listeners.add(cb),
    fire(next) {
      this.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
}

function freshDoc() {
  const doc = document.implementation.createHTMLDocument('t');
  const meta = doc.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', '#ffffff');
  doc.head.append(meta);
  return doc;
}

describe('theme', () => {
  test('resolves system preference and ignores junk values', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  test('cycles system → light → dark → system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
    expect(nextPreference(undefined)).toBe('light');
  });

  test('applyTheme sets data-theme and the status-bar colour', () => {
    const doc = freshDoc();
    applyTheme('dark', doc);
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(doc.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe(THEME_COLORS.dark);
  });

  test('defaults to the system theme and follows it live', () => {
    const media = fakeMedia(true);
    const doc = freshDoc();
    const store = createThemeStore({ storage: memoryStorage(), media, doc });
    store.sync();
    expect(store.getSnapshot()).toEqual({ preference: 'system', theme: 'dark' });
    expect(doc.documentElement.dataset.theme).toBe('dark');
    media.fire(false);
    expect(store.getSnapshot().theme).toBe('light');
    expect(doc.documentElement.dataset.theme).toBe('light');
  });

  test('persists an explicit choice and clears it for "system"', () => {
    const storage = memoryStorage();
    const media = fakeMedia(false);
    const store = createThemeStore({ storage, media, doc: freshDoc() });
    store.setPreference('dark');
    expect(storage.getItem(THEME_KEY)).toBe('dark');
    expect(store.getSnapshot().theme).toBe('dark');
    media.fire(false); // an explicit choice ignores the OS
    expect(store.getSnapshot().theme).toBe('dark');
    store.setPreference('system');
    expect(storage.getItem(THEME_KEY)).toBeNull();
    expect(createThemeStore({ storage: memoryStorage({ [THEME_KEY]: 'light' }), media: fakeMedia(true) }).getSnapshot().theme).toBe('light');
  });

  test('survives blocked storage', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem() {} };
    const store = createThemeStore({ storage: throwing, media: fakeMedia(false) });
    expect(store.getSnapshot().preference).toBe('system');
    store.setPreference('dark');
    expect(store.getSnapshot().theme).toBe('dark');
  });
});

describe('privacy eye', () => {
  test('toggles, persists and mirrors to <html data-privacy>', () => {
    const storage = memoryStorage();
    const doc = freshDoc();
    const store = createPrivacyStore({ storage, doc });
    expect(store.getSnapshot()).toBe(false);
    store.toggle();
    expect(store.getSnapshot()).toBe(true);
    expect(storage.getItem(PRIVACY_KEY)).toBe('1');
    expect('privacy' in doc.documentElement.dataset).toBe(true);
    expect(createPrivacyStore({ storage }).getSnapshot()).toBe(true);
    store.toggle();
    expect(storage.getItem(PRIVACY_KEY)).toBeNull();
    expect('privacy' in doc.documentElement.dataset).toBe(false);
  });

  test('masks amounts inside free text but leaves other numbers alone', () => {
    expect(maskAmountsInText('חסכו ₪1,200 בחודש ו-350 ₪ על קפה, 3 פעמים')).toBe(`חסכו ${MASK} ₪ בחודש ו-${MASK} ₪ על קפה, 3 פעמים`);
    expect(maskAmountsInText(`נשאר ${formatCurrency(4321)}`)).not.toMatch(/4,321/);
    expect(maskAmountsInText('500 ש"ח')).toBe(`${MASK} ₪`);
  });

  test('useMoney re-renders masked amounts when toggled', () => {
    function Amount() {
      const money = useMoney();
      return <p data-testid="amount">{money(1234)}</p>;
    }
    privacyStore.setHidden(false);
    render(<Amount />);
    expect(screen.getByTestId('amount').textContent).toBe(formatCurrency(1234));
    act(() => privacyStore.toggle());
    expect(screen.getByTestId('amount').textContent).toBe(`${MASK} ₪`);
    act(() => privacyStore.setHidden(false));
  });

  test('top-bar button is labelled, pressed-state aware and toggles', async () => {
    const { PrivacyButton } = await import('../src/components/DisplayToggles.jsx');
    privacyStore.setHidden(false);
    render(<PrivacyButton />);
    const button = screen.getByRole('button', { name: 'הסתרת סכומים' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.className).toMatch(/h-12 w-12/);
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'הצגת סכומים' }).getAttribute('aria-pressed')).toBe('true');
    act(() => privacyStore.setHidden(false));
  });
});
