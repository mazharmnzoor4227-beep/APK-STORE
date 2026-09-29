import { adminDatabase } from './server';

export function sanitizeAdminError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error ?? 'Unknown backend error');
  message = message
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/authorization\s*:\s*bearer\s+[^\s]+/gi, 'Authorization: Bearer [redacted]')
    .replace(/bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
  return message.slice(0, 1000) || 'Unknown backend error';
}

export async function recordAdminError(source: string, error: unknown, details: Record<string, unknown> = {}) {
  try {
    const safeSource = String(source || 'unknown').replace(/[^a-zA-Z0-9_./:-]/g, '_').slice(0, 120);
    const safeDetails = Object.fromEntries(Object.entries(details).slice(0, 20).map(([key, value]) => [key.slice(0, 60), typeof value === 'string' ? value.slice(0, 300) : value]));
    await adminDatabase().from('admin_error_events').insert({ source: safeSource, message: sanitizeAdminError(error), details: safeDetails });
  } catch {
    // Error logging must never turn one backend failure into a second user-visible failure.
  }
}
