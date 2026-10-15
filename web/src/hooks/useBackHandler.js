import { useEffect, useRef, useSyncExternalStore } from 'react';
import { isExitPending, registerBackHandler, subscribeExitPrompt } from '../lib/backNavigation.js';

/** Back-handler priorities: the highest active one handles the back button. */
export const BACK_PRIORITY = {
  screen: 10, // leave a sub-screen (admin, account) or an edit flow
  step: 20, // previous step inside a multi-step flow
  dialog: 100, // close a modal
};

/**
 * Runs `handler` when the system back button is pressed, while `enabled` and while this is the
 * highest-priority handler mounted. The latest `handler` closure is always used.
 */
export function useBackHandler(handler, { enabled = true, priority = BACK_PRIORITY.screen } = {}) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    return registerBackHandler(() => ref.current(), priority);
  }, [enabled, priority]);
}

export function useExitPrompt() {
  return useSyncExternalStore(subscribeExitPrompt, isExitPending, () => false);
}
