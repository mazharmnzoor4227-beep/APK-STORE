export const MAX_BODY_BYTES = 32 * 1024;

const ALLOWED = new Set([
  'fingerprint', 'package_id', 'version_code', 'version_name', 'android_sdk',
  'device_manufacturer', 'device_model', 'exception_class', 'message',
  'stack_trace', 'occurred_at'
]);

const HEX64 = /^[0-9a-f]{64}$/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL = /https?:\/\/[^\s]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi;
const SECRET_ASSIGNMENT = /\b(token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi;

function clipped(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(0, max);
}

export function redact(value, max = 16 * 1024) {
  return clipped(value, max)
    .replace(BEARER, 'Bearer [redacted]')
    .replace(SECRET_ASSIGNMENT, (_match, key) => `${key}=[redacted]`)
    .replace(EMAIL, '[email]')
    .replace(URL, '[url]');
}

export function bodySizeAllowed(raw) {
  return new TextEncoder().encode(String(raw ?? '')).byteLength <= MAX_BODY_BYTES;
}

export function normalizeCrashPayload(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid crash payload');
  for (const key of Object.keys(input)) {
    if (!ALLOWED.has(key)) throw new Error(`Unknown crash field: ${key}`);
  }

  const packageId = String(input.package_id ?? '');
  if (packageId !== 'com.apkstore.client') throw new Error('Invalid package');

  const fingerprint = String(input.fingerprint ?? '').toLowerCase();
  if (!HEX64.test(fingerprint)) throw new Error('Invalid fingerprint');

  const versionCode = Number(input.version_code);
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error('Invalid version code');

  const androidSdk = Number(input.android_sdk);
  if (!Number.isInteger(androidSdk) || androidSdk < 26 || androidSdk > 100) throw new Error('Invalid Android SDK');

  const occurredAtMs = Date.parse(String(input.occurred_at ?? ''));
  if (!Number.isFinite(occurredAtMs) || occurredAtMs < now - 90 * 24 * 60 * 60 * 1000 || occurredAtMs > now + 5 * 60 * 1000)
    throw new Error('Invalid crash timestamp');

  const exceptionClass = clipped(input.exception_class, 180);
  const stackTrace = redact(input.stack_trace, 16 * 1024);
  if (!exceptionClass || !stackTrace) throw new Error('Missing crash details');

  return {
    fingerprint,
    package_id: packageId,
    version_code: versionCode,
    version_name: clipped(input.version_name, 64),
    android_sdk: androidSdk,
    device_manufacturer: redact(input.device_manufacturer, 80),
    device_model: redact(input.device_model, 120),
    exception_class: exceptionClass,
    message: redact(input.message, 1024),
    stack_trace: stackTrace,
    occurred_at: new Date(occurredAtMs).toISOString()
  };
}

export function canonicalFingerprintText(event) {
  const frames = String(event.stack_trace ?? '')
    .split('\n')
    .filter((line) => line.includes('at '))
    .slice(0, 12)
    .map((line) => line.trim().replace(/:\d+\)?$/, ':#)'));
  return [String(event.exception_class ?? ''), ...frames].join('\n');
}
