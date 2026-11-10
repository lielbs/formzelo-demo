/** Public page design helpers shared by the guest pages, the menu and the owner preview. */
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/600.css';
import '@fontsource/heebo/700.css';
import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
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
import { runtimeConfiguration } from '../../production/runtime';
import { normalizePublicPages, pageTheme, resolveLook, type BrandKitLite, type PageKind, type PublicPagesConfig, type ResolvedLook } from '../domain/publicPages';

/** Public URL of an immutable organization image (same bucket and path as the Brand Kit). */
export const publicAssetUrl = (orgId: string | undefined, id: string | undefined) =>
  orgId && id && runtimeConfiguration.mode === 'production'
    ? `${runtimeConfiguration.supabaseUrl}/storage/v1/object/public/brand-assets/${orgId}/${id}`
    : '';

export interface PageLookInput {
  pages?: PublicPagesConfig | null;
  brandKit?: BrandKitLite | null;
  assetOwner?: string;
}

/** The look of one public page: null when the venue uses the standard pages. */
export function lookFor(input: PageLookInput, kind: PageKind): { look: ResolvedLook; pages: PublicPagesConfig; logoUrl: string; heroUrl: string } | null {
  if (!input.pages) return null;
  const pages = normalizePublicPages(input.pages);
  const look = resolveLook(pageTheme(pages, kind), input.brandKit);
  return { look, pages, logoUrl: publicAssetUrl(input.assetOwner, look.logoAssetId), heroUrl: publicAssetUrl(input.assetOwner, look.heroAssetId) };
}
