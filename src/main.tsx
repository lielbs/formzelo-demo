import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { RepoProvider } from './data/store';
import { BASE_PATH } from './lib/links';

// Reopen a deep link that the site-wide 404 page sent here (see public/live-fallback.js).
try {
  const deepLink = sessionStorage.getItem('formangle:deep-link');
  if (deepLink) {
    sessionStorage.removeItem('formangle:deep-link');
    if (BASE_PATH && deepLink.startsWith(`${BASE_PATH}/`)) history.replaceState(null, '', deepLink);
  }
} catch {
  // Storage unavailable: start at the requested page.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <AuthProvider>
        <RepoProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </RepoProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
