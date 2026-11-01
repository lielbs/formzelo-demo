// Fonts are bundled locally by @fontsource (no network-hosted fonts). Browsers
// download a face only when a themed page actually uses it.
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/600.css';
import '@fontsource/heebo/700.css';
import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/500.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
import '@fontsource/ibm-plex-sans-hebrew/700.css';
import '@fontsource/bellefair/400.css';
import '@fontsource/secular-one/400.css';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/600.css';
import '@fontsource/assistant/700.css';
import '@fontsource/varela-round/400.css';
import '@fontsource/suez-one/400.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/david-libre/500.css';
import '@fontsource/david-libre/700.css';
import './theme.css';
import './premium.css';
import './signature.css';
import './media.css';
import './atelier.css';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { WorkflowTheme } from '../domain/theme';
import { themeTokens } from './tokens';

/** Applies a theme's tokens to a subtree. Nested scopes simply override. */
export function ThemeScope({ theme, className, style, children }: { theme: WorkflowTheme; className?: string; style?: CSSProperties; children: ReactNode }) {
  const tokens = useMemo(() => themeTokens(theme), [theme]);
  return (
    <div className={className ? `fz ${className}` : 'fz'} style={{ ...tokens.style, ...style }} {...tokens.attrs}>
      {children}
    </div>
  );
}
