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
import { ConfirmHost } from './components/Confirm';
import { RepoProvider } from './data/store';
import { framedByOtherOrigin, isFrameProtectedPath, routePath } from './lib/frameGuard';
import { BASE_PATH } from './lib/links';
import { installPressFeedback } from './lib/press';

// Reopen a deep link that the site-wide 404 page sent here (see public/site-fallback.js): the demo
// at the root takes non-/live paths; the production app at /live/ takes its own.
try {
  const deepLink = sessionStorage.getItem('formangle:deep-link');
  if (deepLink) {
    sessionStorage.removeItem('formangle:deep-link');
    const ours = BASE_PATH ? deepLink.startsWith(`${BASE_PATH}/`) : deepLink.startsWith('/') && !deepLink.startsWith('/live/');
    if (ours) history.replaceState(null, '', deepLink);
  }
} catch {
  // Storage unavailable: start at the requested page.
}

installPressFeedback();

const root = createRoot(document.getElementById('root')!);
if (isFrameProtectedPath(routePath(window.location.pathname, BASE_PATH)) && framedByOtherOrigin(window)) {
  // Staff and account screens never run inside another site's frame (clickjacking).
  root.render(
    <main dir="rtl" lang="he" style={{ padding: 24, fontFamily: 'Rubik, system-ui, sans-serif', textAlign: 'center' }}>
      <p>מטעמי אבטחה, המסך הזה נפתח רק בחלון נפרד.</p>
      <p><a href={window.location.href} target="_blank" rel="noopener noreferrer">פתיחה בחלון חדש</a></p>
    </main>,
  );
} else root.render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <AuthProvider>
        <RepoProvider>
          <ToastProvider>
            <App />
            <ConfirmHost />
          </ToastProvider>
        </RepoProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
