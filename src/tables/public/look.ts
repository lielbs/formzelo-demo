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
import { brandedDefaults, normalizePublicPages, pageTheme, resolveLook, type BrandKitLite, type PageKind, type PublicPagesConfig, type ResolvedLook } from '../domain/publicPages';

/** Public URL of an immutable organization image (same bucket and path as the Brand Kit). */
export const publicAssetUrl = (orgId: string | undefined, id: string | undefined) =>
  orgId && id && runtimeConfiguration.mode === 'production'
    ? `${runtimeConfiguration.supabaseUrl}/storage/v1/object/public/brand-assets/${orgId}/${id}`
    : '';

export interface PageLookInput {
  pages?: PublicPagesConfig | null;
  brandKit?: BrandKitLite | null;
  assetOwner?: string;
  venueType?: string | null;
}

export interface PageDesign {
  look: ResolvedLook;
  pages: PublicPagesConfig;
  logoUrl: string;
  heroUrl: string;
  /** No published design: standard fields and wording, look from the Brand Kit. */
  standard: boolean;
}

/** The look of one public page. Every venue page is branded; a published design refines it. */
export function lookFor(input: PageLookInput, kind: PageKind): PageDesign {
  const standard = !input.pages;
  const pages = input.pages ? normalizePublicPages(input.pages) : brandedDefaults(input.venueType);
  const look = resolveLook(pageTheme(pages, kind), input.brandKit);
  return { look, pages, standard, logoUrl: publicAssetUrl(input.assetOwner, look.logoAssetId), heroUrl: publicAssetUrl(input.assetOwner, look.heroAssetId) };
}

/** The published page config of a kind, or null for the standard page. */
export const pageOf = (d: PageDesign | null | undefined, kind: PageKind) => (d && !d.standard ? d.pages[kind] : null);
