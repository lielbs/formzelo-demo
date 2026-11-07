import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleAccountOnboarding } from '../_shared/accountOnboarding.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigin = Deno.env.get('FORMANGLE_APP_ORIGIN')!;
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve((request) => handleAccountOnboarding(request, {
  allowedOrigin,
  async target({ token, organizationId }) {
    const { data, error } = await service.rpc('server_invitation_onboarding_target', { invitation_token: token, expected_organization_id: organizationId });
    if (error) throw new Error('lookup failed');
    const row = data?.[0];
    return row ? { email: row.email, accountExists: row.account_exists } : null;
  },
  async createAccount({ email, password }) {
    const { error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error('account creation failed');
  },
}));
