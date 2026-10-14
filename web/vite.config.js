import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

// GitHub Pages serves the app from https://eliya697.github.io/AuraFin-foundation-and-onboarding/
const GH_PAGES_BASE = '/AuraFin-foundation-and-onboarding/';

export default defineConfig(({ command, isPreview }) => ({
  // Production builds and `vite preview` use the Pages subpath; only the dev server stays at "/".
  base: command === 'build' || isPreview ? GH_PAGES_BASE : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': sharedDir },
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
