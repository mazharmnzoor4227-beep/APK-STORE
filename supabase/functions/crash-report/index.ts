import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

// Public-safe crash report ingest. Uses service role server-side only.
// The crash_reports table must have RLS: no public read, insert via this function only.

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, secret, { auth: { persistSession: false } });

function reply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'Invalid JSON' }, 400);
  }
  const stack = String(body.stack ?? '').slice(0, 20000);
  if (!stack) return reply({ error: 'Missing stack trace' }, 400);
  const row = {
    package_id: String(body.package_id ?? '').slice(0, 128),
    app_version: String(body.app_version ?? '').slice(0, 32),
    version_code: Number(body.version_code ?? 0) || 0,
    android_version: String(body.android_version ?? '').slice(0, 32),
    device_model: String(body.device_model ?? '').slice(0, 64),
    exception_type: String(body.exception_type ?? '').slice(0, 128),
    message: String(body.message ?? '').slice(0, 500),
    stack,
    screen: String(body.screen ?? '').slice(0, 64),
    device_id: String(body.device_id ?? '').slice(0, 64),
  };
  const { error } = await db.from('crash_reports').insert(row);
  if (error) return reply({ error: 'Store failed' }, 500);
  return reply({ ok: true });
});
