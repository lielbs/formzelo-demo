/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORMANGLE_MODE?: 'demo' | 'production';
  readonly VITE_SUPABASE_PROJECT_REF?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** 'true' shows the guest reminders (see src/tables/features.ts). */
  readonly VITE_TABLES_REMINDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
