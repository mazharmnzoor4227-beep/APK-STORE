export const MAX_BODY_BYTES = 24_000;
export const ALLOWED_PACKAGE = 'com.apkstore.client';

const keys = new Set([
  'fingerprint', 'package_id', 'version_code', 'version_name', 'android_sdk',
  'device_manufacturer', 'device_model', 'exception_class', 'message',
  'stack_trace', 'occurred_at'
]);

function text(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, max);
}

export function normalizeCrashPayload(input, nowMs = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid crash report');
  for (const key of Object.keys(input)) if (!keys.has(key)) throw new Error('Unknown crash field');

  const fingerprint = text(input.fingerprint, 64).toLowerCase();
  const packageId = text(input.package_id, 100);
  const versionCode = Number(input.version_code);
  const sdk = Number(input.android_sdk);
  const occurredMs = Date.parse(String(input.occurred_at ?? ''));

  if (packageId !== ALLOWED_PACKAGE) throw new Error('Invalid package');
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('Invalid fingerprint');
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error('Invalid version');
  if (!Number.isInteger(sdk) || sdk < 26 || sdk > 100) throw new Error('Invalid Android version');
  if (!Number.isFinite(occurredMs) || occurredMs > nowMs + 5 * 60_000 || occurredMs < nowMs - 90 * 24 * 60 * 60_000)
    throw new Error('Invalid crash timestamp');

  const event = {
    fingerprint,
    package_id: packageId,
    version_code: versionCode,
    version_name: text(input.version_name, 64),
    android_sdk: sdk,
    device_manufacturer: text(input.device_manufacturer, 80),
    device_model: text(input.device_model, 120),
    exception_class: text(input.exception_class, 180),
    message: text(input.message, 1000),
    stack_trace: text(input.stack_trace, 16000),
    occurred_at: new Date(occurredMs).toISOString()
  };
  if (!event.version_name || !event.exception_class || !event.stack_trace) throw new Error('Missing crash fields');
  return event;
}

export function bodySizeAllowed(raw) {
  return new TextEncoder().encode(raw).byteLength <= MAX_BODY_BYTES;
}
