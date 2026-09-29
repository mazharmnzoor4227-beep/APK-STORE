const DEFAULT_ADMIN_ORIGIN = 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site';

export class AdminUploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminUploadError';
    this.status = status;
  }
}

export async function adminUploadAction(request: Request, action: string, body: Record<string, unknown>) {
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get('authorization');
  if (!url || !publishable) throw new AdminUploadError('Admin backend is not configured', 503);
  if (!authorization?.startsWith('Bearer ')) throw new AdminUploadError('Owner authorization required', 401);

  const response = await fetch(`${url}/functions/v1/admin-upload?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: publishable,
      Origin: process.env.ADMIN_PUBLIC_ORIGIN || DEFAULT_ADMIN_ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  let payload: Record<string, unknown> = {};
  try { payload = await response.json() as Record<string, unknown>; }
  catch { /* preserve the HTTP status below */ }
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Upload service failed (${response.status})`;
    throw new AdminUploadError(message, response.status);
  }
  return payload;
}
