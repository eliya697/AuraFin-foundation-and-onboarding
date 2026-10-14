import { useSyncExternalStore } from 'react';
import { getSnapshot, isIOSSafari, promptInstall, subscribe } from './installPrompt.js';

/**
 * Install state for the in-app "Install app" UI.
 *  - canPrompt: Chrome/Edge/Android captured `beforeinstallprompt`; call promptInstall().
 *  - needsIOSInstructions: iOS Safari, which has no prompt API (Share → Add to Home Screen).
 */
export function useInstallPrompt() {
  const { canPrompt, installed } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    canPrompt,
    installed,
    needsIOSInstructions: !installed && !canPrompt && isIOSSafari(),
    promptInstall,
  };
}
