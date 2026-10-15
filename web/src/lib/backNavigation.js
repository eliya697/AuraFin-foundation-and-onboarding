/**
 * Hardware/system back button support for a single-screen app (no router).
 *
 * The app keeps one "guard" history entry on top of its real entry. Pressing back pops the guard
 * and fires `popstate`; we then run the most specific registered back handler (close a dialog,
 * previous step, leave a sub-screen…) and push a new guard. With no handler left, the exit prompt
 * is shown and the guard is NOT restored, so a second back press really leaves the app — which is
 * how Android PWAs are expected to behave.
 *
 * Chrome ignores history entries added without a user gesture when the back button is pressed, so
 * the guard is (re-)armed from the next tap/keypress if it could not be armed earlier.
 */

const GUARD_STATE = { aurafinGuard: true };

let handlers = []; // { id, priority, run }
let nextId = 1;
let installed = false;
let armed = false;
let exitPending = false;
let exitListener = null;
const exitSubscribers = new Set();

/** The handler that a back press would run: highest priority, latest registration wins ties. */
export function topHandler(list = handlers) {
  let best = null;
  for (const entry of list) {
    if (!best || entry.priority > best.priority || (entry.priority === best.priority && entry.id > best.id)) best = entry;
  }
  return best;
}

/** Registers a back handler; returns an unregister function. */
export function registerBackHandler(run, priority = 0) {
  const entry = { id: nextId++, priority, run };
  handlers = [...handlers, entry];
  return () => {
    handlers = handlers.filter((h) => h !== entry);
  };
}

function setExitPending(value) {
  exitPending = value;
  exitSubscribers.forEach((cb) => cb(value));
}

export function subscribeExitPrompt(cb) {
  exitSubscribers.add(cb);
  return () => exitSubscribers.delete(cb);
}

export const isExitPending = () => exitPending;

function arm() {
  if (armed || exitPending) return;
  try {
    window.history.pushState(GUARD_STATE, '');
    armed = true;
  } catch {
    // Some embedded browsers throttle history calls; the next gesture retries.
  }
}

/** Keep the app open: dismiss the exit prompt and restore the guard. */
export function cancelExit() {
  setExitPending(false);
  arm();
}

/** Simulates a back press (used by on-screen "back" affordances and tests). */
export function handleBack() {
  const top = topHandler();
  if (top) {
    top.run();
    return true;
  }
  setExitPending(true);
  exitListener?.();
  return false;
}

function onPopState(event) {
  if (event.state?.aurafinGuard) {
    // Forward navigation landed back on a guard entry.
    armed = true;
    return;
  }
  armed = false;
  if (exitPending) return; // second back press while the prompt is open: let the app close
  if (handleBack()) arm();
}

function onGesture() {
  if (!armed && !exitPending) arm();
}

export function installBackNavigation({ onExitRequest } = {}) {
  exitListener = onExitRequest ?? null;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  armed = Boolean(window.history.state?.aurafinGuard);
  window.addEventListener('popstate', onPopState);
  // Activation-triggering events (pointerdown does not count for touch, pointerup does).
  for (const type of ['pointerup', 'keydown', 'touchend']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  arm();
}

/** Test helper. */
export function __resetBackNavigation() {
  handlers = [];
  armed = false;
  exitPending = false;
}
