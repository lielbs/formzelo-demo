import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { runPushReminders } from '../_shared/pushReminders.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const result = await runPushReminders({
      async rpc(fn, args) {
        const { data, error } = await service.rpc(fn, args);
        if (error) throw new Error(`${fn} failed`);
        return data;
      },
      fetch,
    });
    // Counts only: no addresses or booking data in the logs.
    console.log(JSON.stringify({ job: 'tables-push-reminders', ...result }));
    return Response.json(result);
  } catch (e) {
    console.error(JSON.stringify({ job: 'tables-push-reminders', error: e instanceof Error ? e.message : 'error' }));
    return Response.json({ error: 'failed' }, { status: 500 });
  }
});
