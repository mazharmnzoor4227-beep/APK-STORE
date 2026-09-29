import { adminDatabase } from './server';
import { sanitizeAdminError } from './error-sanitize';
export { sanitizeAdminError } from './error-sanitize';

export async function recordAdminError(source: string, error: unknown, details: Record<string, unknown> = {}) {
  try {
    const safeSource = String(source || 'unknown').replace(/[^a-zA-Z0-9_./:-]/g, '_').slice(0, 120);
    const safeDetails = Object.fromEntries(Object.entries(details).slice(0, 20).map(([key, value]) => [key.slice(0, 60), typeof value === 'string' ? value.slice(0, 300) : value]));
    await adminDatabase().from('admin_error_events').insert({ source: safeSource, message: sanitizeAdminError(error), details: safeDetails });
  } catch {
    // Error logging must never turn one backend failure into a second user-visible failure.
  }
}
