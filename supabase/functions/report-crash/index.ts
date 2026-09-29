import { bodySizeAllowed, normalizeCrashPayload, MAX_BODY_BYTES } from './crash-payload.mjs';

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};
const encoder = new TextEncoder();

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function derivedClientKey(request: Request, secret: string) {
  const rawIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawIp));
  return Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });

  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (declaredLength > MAX_BODY_BYTES) return reply(413, { error: 'Crash report too large' });

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return reply(400, { error: 'Invalid request body' });
  }
  if (!bodySizeAllowed(raw)) return reply(413, { error: 'Crash report too large' });

  let event;
  try {
    event = normalizeCrashPayload(JSON.parse(raw));
  } catch {
    return reply(400, { error: 'Invalid crash report' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return reply(503, { error: 'Crash service unavailable' });

  const response = await fetch(`${url}/rest/v1/rpc/record_crash_report`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_client_key: await derivedClientKey(request, serviceKey),
      p_fingerprint: event.fingerprint,
      p_package_id: event.package_id,
      p_version_code: event.version_code,
      p_version_name: event.version_name,
      p_android_sdk: event.android_sdk,
      p_device_manufacturer: event.device_manufacturer,
      p_device_model: event.device_model,
      p_exception_class: event.exception_class,
      p_message: event.message,
      p_stack_trace: event.stack_trace,
      p_occurred_at: event.occurred_at
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429 || /rate limit/i.test(detail))
      return reply(429, { error: 'Too many crash reports' });
    return reply(503, { error: 'Crash service unavailable' });
  }
  return reply(202, { accepted: true });
});
