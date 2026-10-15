import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom lacks these browser APIs used by Recharts and framer-motion.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
});
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
