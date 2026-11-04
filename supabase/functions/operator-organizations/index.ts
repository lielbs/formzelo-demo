import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleOperatorOrganization } from '../_shared/operatorOrganization.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigin = Deno.env.get('FORMANGLE_APP_ORIGIN')!;

Deno.serve((request) => handleOperatorOrganization(request, {
  allowedOrigin,
  async authenticate(jwt) {
    const authClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data, error } = await authClient.auth.getUser(jwt);
    return error || !data.user ? null : { userId: data.user.id };
  },
  async provision(input) {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await serviceClient.rpc('server_provision_organization_authorized', {
      slug: input.slug,
      name: input.name,
      owner_email: input.ownerEmail,
      actor_user_id: input.actorUserId,
    });
    if (error || !data?.[0]) throw new Error('Organization provisioning failed');
    return {
      organizationId: data[0].organization_id,
      token: data[0].invitation_token,
      expiresAt: data[0].invitation_expires_at,
    };
  },
}));
