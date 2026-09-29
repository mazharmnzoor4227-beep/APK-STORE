const MAX_BODY_BYTES = 48 * 1024;
const encoder = new TextEncoder();
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/(authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+\-/=]+/gi, '$1[redacted]')
    .replace(/(apikey|api_key|token|password|secret)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/[^\s)\]]+/gi, '[url]')
    .slice(0, max);
}

function field(input: Record<string, unknown>, ...names: string[]) {
  for (const name of names) if (input[name] !== undefined && input[name] !== null) return input[name];
  return undefined;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, apikey, authorization' } });
  }
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });

  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_BODY_BYTES) return reply(413, { error: 'Crash report too large' });

  let raw = '';
  try { raw = await request.text(); } catch { return reply(400, { error: 'Invalid request body' }); }
  if (!raw || encoder.encode(raw).byteLength > MAX_BODY_BYTES) return reply(413, { error: 'Crash report too large' });

  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    input = parsed;
  } catch {
    return reply(400, { error: 'Invalid crash report' });
  }

  const packageId = clean(field(input, 'package_id', 'packageId'), 100);
  const fingerprint = clean(field(input, 'fingerprint'), 64).toLowerCase();
  const versionCode = Number(field(input, 'version_code', 'versionCode'));
  const versionName = clean(field(input, 'version_name', 'versionName'), 64);
  const androidSdk = Number(field(input, 'android_sdk', 'androidSdk', 'sdk'));
  const manufacturer = clean(field(input, 'device_manufacturer', 'deviceManufacturer', 'manufacturer'), 80);
  const model = clean(field(input, 'device_model', 'deviceModel', 'model'), 120);
  const exceptionClass = clean(field(input, 'exception_class', 'exceptionClass'), 180);
  const message = clean(field(input, 'message'), 2048);
  const stackTrace = clean(field(input, 'stack_trace', 'stackTrace'), 32768);
  const occurredRaw = String(field(input, 'occurred_at', 'occurredAt', 'timestamp') ?? '');
  const occurredMs = Date.parse(occurredRaw);
  const requestedType = clean(field(input, 'report_type', 'reportType'), 16).toLowerCase();
  const reportType = requestedType === 'handled' ? 'handled' : 'crash';

  if (packageId !== 'com.apkstore.client') return reply(400, { error: 'Invalid package' });
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return reply(400, { error: 'Invalid fingerprint' });
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) return reply(400, { error: 'Invalid version' });
  if (!versionName || !exceptionClass || !stackTrace) return reply(400, { error: 'Missing crash fields' });
  if (Number.isFinite(androidSdk) && (androidSdk < 1 || androidSdk > 100)) return reply(400, { error: 'Invalid Android SDK' });
  const now = Date.now();
  if (!Number.isFinite(occurredMs) || occurredMs > now + 5 * 60_000 || occurredMs < now - 90 * 24 * 60 * 60_000) {
    return reply(400, { error: 'Invalid crash timestamp' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return reply(503, { error: 'Crash service unavailable' });

  try {
    const rpc = await fetch(`${url}/rest/v1/rpc/record_crash_report`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_fingerprint: fingerprint,
        p_package_id: packageId,
        p_version_code: versionCode,
        p_version_name: versionName,
        p_android_sdk: Number.isFinite(androidSdk) ? Math.trunc(androidSdk) : null,
        p_device_manufacturer: manufacturer,
        p_device_model: model,
        p_exception_class: exceptionClass,
        p_message: message,
        p_stack_trace: stackTrace,
        p_occurred_at: new Date(occurredMs).toISOString(),
        p_report_type: reportType,
      }),
    });
    if (!rpc.ok) {
      console.error('crash-report ingest failed', rpc.status, (await rpc.text().catch(() => '')).slice(0, 300));
      return reply(503, { error: 'Crash service unavailable' });
    }
    const id = await rpc.json().catch(() => null);
    return reply(200, { ok: true, id });
  } catch (error) {
    console.error('crash-report error', error instanceof Error ? error.message : 'unknown');
    return reply(503, { error: 'Crash service unavailable' });
  }
});
