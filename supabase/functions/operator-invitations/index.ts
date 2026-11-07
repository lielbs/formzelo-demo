import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleOperatorInvitation } from '../_shared/operatorInvitation.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigin = Deno.env.get('FORMANGLE_APP_ORIGIN')!;

Deno.serve((request) => handleOperatorInvitation(request, {
  allowedOrigin,
  async authenticate(jwt) {
    const authClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data, error } = await authClient.auth.getUser(jwt);
    return error || !data.user ? null : { userId: data.user.id };
  },
  async createInvitation(input) {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await serviceClient.rpc('server_create_owner_invitation_authorized', {
      target_organization_id: input.organizationId,
      intended_email: input.email,
      actor_user_id: input.actorUserId,
      valid_for: '48 hours',
    });
    if (error || !data?.[0]) throw new Error('Invitation creation failed');
    return { token: data[0].invitation_token, expiresAt: data[0].invitation_expires_at };
  },
}));
