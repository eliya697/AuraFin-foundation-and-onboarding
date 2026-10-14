import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import { JourneyProvider } from './state/JourneyContext.jsx';
import { registerServiceWorker } from './registerServiceWorker.js';
import './pwa/installPrompt.js'; // capture beforeinstallprompt before React mounts
import './index.css';

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <JourneyProvider>
        <App />
      </JourneyProvider>
    </MotionConfig>
  </StrictMode>,
);
