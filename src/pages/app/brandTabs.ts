import { Building2, Eye, Link2, Palette } from 'lucide-react';

/** Brand Kit areas, addressable as /app/brand?tab=<id>. */
export const BRAND_TABS = [
  { id: 'details', label: 'פרטי העסק', icon: Building2 },
  { id: 'design', label: 'עיצוב ומיתוג', icon: Palette },
  { id: 'links', label: 'קישורים עסקיים', icon: Link2 },
  { id: 'preview', label: 'תצוגה מקדימה', icon: Eye },
] as const;
export type BrandTab = (typeof BRAND_TABS)[number]['id'];
