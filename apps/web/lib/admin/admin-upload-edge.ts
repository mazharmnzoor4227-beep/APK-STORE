type EdgeResult<T> = { ok: boolean; status: number; data: T };

const defaultAdminOrigin = 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site';

export async function callAdminUploadEdge<T>(request: Request, action: string, body?: unknown): Promise<EdgeResult<T>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get('authorization');
  if (!supabaseUrl || !publishableKey) throw new Error('Upload storage is not configured');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Owner authorization required');
  if (!/^[a-z-]+$/.test(action)) throw new Error('Invalid upload action');

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-upload?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: authorization,
      apikey: publishableKey,
      Origin: process.env.ADMIN_ORIGIN || defaultAdminOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({ error: `Upload service failed (${response.status})` })) as T;
  return { ok: response.ok, status: response.status, data };
}
