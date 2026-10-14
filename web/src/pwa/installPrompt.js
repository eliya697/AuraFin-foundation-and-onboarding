/**
 * Captures the browser's install prompt as early as possible.
 *
 * Chrome can fire `beforeinstallprompt` before React has mounted, so the listener is attached at
 * module load (this file is imported from main.jsx) and the event is kept in a tiny store that
 * components subscribe to via useInstallPrompt().
 */

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
let snapshot = { canPrompt: false, installed: false };

function emit() {
  snapshot = { canPrompt: Boolean(deferredPrompt) && !installed, installed };
  listeners.forEach((listener) => listener());
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

export function isIOSSafari() {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  // Chrome/Firefox/Edge on iOS cannot add to the home screen from their own menus as reliably; target Safari.
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

if (typeof window !== 'undefined') {
  installed = isStandalone();
  snapshot = { canPrompt: false, installed };

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's mini-infobar from showing; we offer our own button instead.
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

/** Shows the native install dialog. Resolves to 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  // A prompt event can only be used once.
  deferredPrompt = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') {
    installed = true;
    emit();
  }
  return outcome;
}
