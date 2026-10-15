import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { supabaseConfigProblem } from './src/services/backend/supabaseConfigCheck.js';

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

// GitHub Pages serves the app from https://eliya697.github.io/AuraFin-foundation-and-onboarding/
const GH_PAGES_BASE = '/AuraFin-foundation-and-onboarding/';

/** Fails `vite build` instead of shipping a bundle whose sign-in can never reach Supabase. */
function checkSupabaseEnv(mode) {
  return {
    name: 'aurafin-check-supabase-env',
    apply: 'build',
    configResolved() {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const url = (env.VITE_SUPABASE_URL ?? '').trim();
      const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
      if (!url && !key) {
        console.warn('[aurafin] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set: the build will show a "setup required" screen.');
        return;
      }
      const problem = !url || !key ? 'Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' : supabaseConfigProblem(url.replace(/\/+$/, ''), key);
      if (problem) throw new Error(`[aurafin] Invalid Supabase settings for "${mode}" build: ${problem}`);
    },
  };
}

export default defineConfig(({ command, isPreview, mode }) => ({
  // Production builds and `vite preview` use the Pages subpath; only the dev server stays at "/".
  base: command === 'build' || isPreview ? GH_PAGES_BASE : '/',
  plugins: [react(), tailwindcss(), checkSupabaseEnv(mode)],
  resolve: {
    alias: { '@shared': sharedDir },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js'],
    restoreMocks: true,
  },
  server: {
    port: 5173,
    fs: { allow: ['.', sharedDir] },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}));
