import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './locales/i18n.ts';
import './index.css';
import { triggerChunkReloadOnce } from './utils/lazyWithRetry';

// Recover seamlessly when a fresh deployment replaces hashed Vite chunks under an open tab
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    triggerChunkReloadOnce();
  });
}

// One-time cleanup: remove obsolete auth token from localStorage on app start
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('bd_legal_token');
  }
} catch {
  // Ignore in case storage access is restricted
}

createRoot(document.getElementById('root')!).render(<App />);

