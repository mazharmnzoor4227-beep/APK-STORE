import { adminDatabase, requireOwner } from '../../../../lib/admin/server';
import { decorateCrashIssues } from '../../../../lib/admin/crashes';
import { recordAdminError } from '../../../../lib/admin/errors';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const db = adminDatabase();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [issuesResult, eventsResult, recentResult, backendResult] = await Promise.all([
      db.from('crash_issues')
        .select('fingerprint,package_id,title,exception_class,status,first_seen_at,last_seen_at,event_count,latest_version_code,latest_version_name')
        .order('last_seen_at', { ascending: false }).limit(100),
      db.from('crash_events')
        .select('fingerprint,version_code,version_name,android_sdk,device_manufacturer,device_model,exception_class,message,stack_trace,occurred_at,received_at')
        .order('received_at', { ascending: false }).limit(500),
      db.from('crash_events').select('id', { count: 'exact', head: true }).gte('received_at', since),
      db.from('admin_error_events').select('id,source,message,details,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (issuesResult.error) throw issuesResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (recentResult.error) throw recentResult.error;
    if (backendResult.error) throw backendResult.error;
    const issues = decorateCrashIssues((issuesResult.data ?? []) as never[], (eventsResult.data ?? []) as never[]);
    const openCount = issues.filter(issue => issue.status === 'open').length;
    return Response.json({
      summary: { openCount, recentReports: recentResult.count ?? 0, issueCount: issues.length, backendErrorCount: backendResult.data?.length ?? 0 },
      issues,
      backendErrors: backendResult.data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await recordAdminError('api/admin/crashes', error);
    const message = error instanceof Error ? error.message : 'Unavailable';
    const status = /owner|token|sign|session|auth/i.test(message) ? 401 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
