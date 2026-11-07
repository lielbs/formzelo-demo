/**
 * Synthetic identities on the disposable local stack only. Refuses any other host, so these
 * helpers can never touch Supabase Cloud.
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

export const API_URL = 'http://127.0.0.1:54321';
const DB_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

function serviceKey(): string {
  const key = process.env.E2E_SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('Set E2E_SUPABASE_SERVICE_KEY to the LOCAL stack service key (supabase status -o env).');
  return key;
}

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createUser(email: string, password: string): Promise<string> {
  const admin = createClient(API_URL, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

export async function sql<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function createOperator(email: string, password: string) {
  const id = await createUser(email, password);
  await sql('insert into private.platform_operators(user_id) values ($1)', [id]);
  return id;
}
