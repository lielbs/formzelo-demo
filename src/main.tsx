import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { RepoProvider } from './data/store';
import { BASE_PATH } from './lib/links';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <RepoProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </RepoProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
