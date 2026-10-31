import { Component, type ErrorInfo, type ReactNode } from 'react';
import { appHref } from '../lib/links';

/** Last-resort boundary: logs the error and offers a recovery path instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[formangle] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" className="flex min-h-screen flex-col items-center justify-center bg-cloud px-4 text-center">
        <h1 className="text-xl font-semibold text-ink">משהו השתבש בתצוגה</h1>
        <p className="mt-2 max-w-md text-sm text-ink-muted">הנתונים שלכם שמורים בדפדפן. נסו לרענן; אם הבעיה חוזרת, אפשר לאפס את נתוני הדמו בעמוד סביבות הדמו.</p>
        <div className="mt-6 flex gap-2">
          <button className="h-10 rounded-xl bg-orange px-4 text-sm font-medium text-white" onClick={() => window.location.reload()}>
            רענון
          </button>
          <a className="inline-flex h-10 items-center rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium" href={appHref('/demo')}>
            לסביבות הדמו
          </a>
        </div>
      </main>
    );
  }
}
