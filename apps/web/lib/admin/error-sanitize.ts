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
