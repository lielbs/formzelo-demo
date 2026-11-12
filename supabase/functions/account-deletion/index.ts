import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleAccountDeletion } from '../_shared/accountDeletion.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigin = Deno.env.get('FORMANGLE_APP_ORIGIN')!;
const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve((request) => handleAccountDeletion(request, {
  allowedOrigin,
  async authenticate(jwt) {
    const authClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data, error } = await authClient.auth.getUser(jwt);
    return error || !data.user ? null : { userId: data.user.id };
  },
  async prepare(userId) {
    const { error } = await service.rpc('server_prepare_account_deletion', { p_user_id: userId });
    if (error) throw new Error(/team_needs_owner/.test(error.message) ? 'team_needs_owner' : 'prepare failed');
  },
  async deleteUser(userId) {
    // Soft delete: the sign-in, its email and sessions are removed; the id stays for the audit trail.
    const { error } = await service.auth.admin.deleteUser(userId, true);
    if (error) throw new Error('delete failed');
  },
}));
