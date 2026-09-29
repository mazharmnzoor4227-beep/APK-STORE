export async function dispatchInspection(candidateId: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  if (!/^[0-9a-f-]{36}$/.test(candidateId)) throw new Error('Invalid candidate ID');
  const repository = process.env.GITHUB_REPOSITORY || 'mazharmnzoor4227-beep/APK-STORE';
  const dispatch = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'inspect-apk', client_payload: { candidateId } }),
  });
  if (!dispatch.ok) throw new Error('Could not queue APK inspection');
  return true;
}
