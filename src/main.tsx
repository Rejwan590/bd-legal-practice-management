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

