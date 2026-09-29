const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const PACKAGE = "com.apkstore.client";
function reply(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function clean(value: unknown, max: number) { return String(value ?? "").replace(/[\u0000-\u001f&&[^\n\t]]/g, "").slice(0, max); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 24000) return reply(413, { error: "Crash report too large" });
  let input: any;
  try { input = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  const fingerprint = clean(input.fingerprint, 64).toLowerCase();
  const packageId = clean(input.package_id, 100);
  const versionCode = Number(input.version_code);
  const sdk = Number(input.android_sdk);
  if (packageId !== PACKAGE || !/^[0-9a-f]{64}$/.test(fingerprint) || !Number.isInteger(versionCode) || versionCode <= 0 || !Number.isInteger(sdk) || sdk < 26 || sdk > 100)
    return reply(400, { error: "Invalid crash report" });
  const event = {
    fingerprint, package_id: packageId, version_code: versionCode,
    version_name: clean(input.version_name, 64), android_sdk: sdk,
    device_manufacturer: clean(input.device_manufacturer, 80),
    device_model: clean(input.device_model, 120),
    exception_class: clean(input.exception_class, 180),
    message: clean(input.message, 1000), stack_trace: clean(input.stack_trace, 16000),
    occurred_at: new Date(input.occurred_at).toISOString()
  };
  if (!event.exception_class || !event.stack_trace || !event.version_name) return reply(400, { error: "Missing crash fields" });
  const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { "apikey": key, "authorization": "Bearer " + key, "content-type": "application/json", "prefer": "return=representation" };
  const issueUrl = url + "/rest/v1/crash_issues?fingerprint=eq." + encodeURIComponent(fingerprint);
  const existingRes = await fetch(issueUrl + "&select=event_count,status,first_seen_at", { headers });
  const existing = existingRes.ok ? (await existingRes.json())[0] : null;
  const now = new Date().toISOString();
  const issue = {
    fingerprint, package_id: packageId, title: event.exception_class, exception_class: event.exception_class,
    status: existing?.status || "open", first_seen_at: existing?.first_seen_at || event.occurred_at,
    last_seen_at: event.occurred_at, event_count: Number(existing?.event_count || 0) + 1,
    latest_version_code: versionCode, latest_version_name: event.version_name, updated_at: now
  };
  const upsert = await fetch(url + "/rest/v1/crash_issues?on_conflict=fingerprint", { method: "POST", headers: { ...headers, "prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(issue) });
  if (!upsert.ok) return reply(503, { error: "Crash service unavailable" });
  const inserted = await fetch(url + "/rest/v1/crash_events", { method: "POST", headers: { ...headers, "prefer": "return=minimal" }, body: JSON.stringify(event) });
  if (!inserted.ok) return reply(503, { error: "Crash service unavailable" });
  return reply(202, { accepted: true });
});
