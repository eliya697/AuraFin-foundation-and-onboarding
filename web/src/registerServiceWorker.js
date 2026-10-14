/**
 * Registers public/sw.js under the Vite base path (e.g. /AuraFin-foundation-and-onboarding/ on
 * GitHub Pages) so the app is installable and keeps working offline.
 *
 * Production only: in `vite dev` a service worker would cache modules and fight hot reload.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((error) => {
      // Not fatal: the app works without it, it just isn't installable/offline-capable.
      console.warn('[AuraFin] Service worker registration failed:', error);
    });
  });
}
