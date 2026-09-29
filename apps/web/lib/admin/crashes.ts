export type CrashStatus = 'open' | 'resolved' | 'ignored';

export type CrashIssueRow = {
  fingerprint: string;
  package_id: string;
  title: string;
  exception_class: string;
  status: CrashStatus;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  latest_version_code: number;
  latest_version_name: string;
};

export type CrashEventRow = {
  fingerprint: string;
  version_code: number;
  version_name: string;
  android_sdk: number;
  device_manufacturer: string;
  device_model: string;
  exception_class: string;
  message: string;
  stack_trace: string;
  occurred_at: string;
  received_at: string;
};

export function isCrashStatus(value: unknown): value is CrashStatus {
  return value === 'open' || value === 'resolved' || value === 'ignored';
}

export function isCrashFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function decorateCrashIssues(issues: CrashIssueRow[], events: CrashEventRow[]) {
  const byFingerprint = new Map<string, CrashEventRow[]>();
  for (const event of events) {
    const rows = byFingerprint.get(event.fingerprint) ?? [];
    rows.push(event);
    byFingerprint.set(event.fingerprint, rows);
  }

  return issues.map(issue => {
    const rows = byFingerprint.get(issue.fingerprint) ?? [];
    const versions = [...new Set(rows.map(row => `${row.version_name} (${row.version_code})`))].slice(0, 8);
    const androidVersions = [...new Set(rows.map(row => `Android SDK ${row.android_sdk}`))].slice(0, 8);
    const deviceModels = [...new Set(rows.map(row => `${row.device_manufacturer} ${row.device_model}`.trim()))].filter(Boolean).slice(0, 12);
    const latest = rows[0] ?? null;
    return { ...issue, versions, androidVersions, deviceModels, latestEvent: latest };
  });
}
