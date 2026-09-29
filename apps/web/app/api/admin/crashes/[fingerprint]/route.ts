import { adminDatabase, requireOwner } from '../../../../../lib/admin/server';
import { isCrashFingerprint, isCrashStatus } from '../../../../../lib/admin/crashes';

export async function PATCH(request: Request, { params }: { params: Promise<{ fingerprint: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { fingerprint } = await params;
    if (!isCrashFingerprint(fingerprint)) return Response.json({ error: 'Invalid crash fingerprint' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    if (!isCrashStatus(body.status)) return Response.json({ error: 'Invalid crash status' }, { status: 400 });

    const db = adminDatabase();
    const { data, error } = await db.from('crash_issues')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('fingerprint', fingerprint)
      .select('fingerprint,status,title')
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Crash issue not found' }, { status: 404 });

    const { error: auditError } = await db.from('admin_audit').insert({
      actor_id: ownerId,
      action: 'crash_status_updated',
      subject_id: null,
      subject_name: data.title || fingerprint,
      details: { fingerprint, status: body.status },
    });
    if (auditError) throw auditError;

    return Response.json({ issue: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Crash status update failed';
    const status = /owner|token|sign|session|auth/i.test(message) ? 401 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
