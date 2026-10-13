import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import { AppStateProvider } from './state/AppStateContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </MotionConfig>
  </StrictMode>,
);
