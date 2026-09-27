import { createClient } from '@supabase/supabase-js';

function config() {
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !serviceKey) throw new Error('Admin backend is not configured');
  return { url, publishable, serviceKey };
}

export function adminDatabase() {
  const { url, serviceKey } = config();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireOwner(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error('Owner authorization required');
  const { url, publishable } = config();
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (error || !expectedEmail || !data.user?.email_confirmed_at || data.user.email?.toLowerCase() !== expectedEmail) throw new Error('Owner authorization required');
  return data.user.id;
}
