import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  __resetBackNavigation,
  cancelExit,
  handleBack,
  installBackNavigation,
  isExitPending,
  registerBackHandler,
  topHandler,
} from '../src/lib/backNavigation.js';

describe('back handler stack', () => {
  beforeEach(() => __resetBackNavigation());

  test('the highest priority handler runs, latest registration breaks ties', () => {
    const screen = vi.fn();
    const step = vi.fn();
    const dialog = vi.fn();
    registerBackHandler(dialog, 100);
    registerBackHandler(screen, 10); // registered after the dialog, but lower priority
    registerBackHandler(step, 20);
    handleBack();
    expect(dialog).toHaveBeenCalledOnce();
    expect(step).not.toHaveBeenCalled();
    expect(screen).not.toHaveBeenCalled();
  });

  test('unregistering falls back to the next handler', () => {
    const screen = vi.fn();
    registerBackHandler(screen, 10);
    const off = registerBackHandler(() => {}, 20);
    off();
    expect(topHandler().priority).toBe(10);
    handleBack();
    expect(screen).toHaveBeenCalledOnce();
  });

  test('with nothing to go back to, the exit prompt opens and can be dismissed', () => {
    const onExit = vi.fn();
    installBackNavigation({ onExitRequest: onExit });
    expect(handleBack()).toBe(false);
    expect(isExitPending()).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
    cancelExit();
    expect(isExitPending()).toBe(false);
  });

  test('a real popstate (system back) runs the handler and re-arms the guard', () => {
    installBackNavigation();
    const step = vi.fn();
    registerBackHandler(step, 20);
    const push = vi.spyOn(window.history, 'pushState');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(step).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith({ aurafinGuard: true }, '');
  });
});
