import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './locales/i18n.ts';
import './index.css';

// One-time cleanup: remove obsolete auth token from localStorage on app start
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('bd_legal_token');
  }
} catch {
  // Ignore in case storage access is restricted
}

createRoot(document.getElementById('root')!).render(<App />);

// Register Chamber PWA Service Worker (only for Chamber app, never in /admin)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !window.location.pathname.startsWith('/admin')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('PWA service worker registration failed:', err);
      });
  });
}

