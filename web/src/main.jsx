// First: capture any email-link auth parameters before anything else can touch the URL.
import './services/backend/authCallback.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import { installBackNavigation } from './lib/backNavigation.js';
import { registerServiceWorker } from './registerServiceWorker.js';
import './pwa/installPrompt.js'; // capture beforeinstallprompt before React mounts
import './index.css';

registerServiceWorker();
// Before React mounts, so the first back press is already caught (Android hardware/gesture back).
installBackNavigation();

window.addEventListener('unhandledrejection', (event) => {
  console.error('[AuraFin] Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary fullScreen label="Root">
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <App />
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);
