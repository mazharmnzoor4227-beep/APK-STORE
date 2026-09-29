from pathlib import Path

p = Path('supabase/functions/admin-upload/index.ts')
s = p.read_text()

anchor = "import { createHash } from 'node:crypto';\n"
if "inspection-policy.mjs" not in s:
    if anchor not in s:
        raise SystemExit('import anchor not found')
    s = s.replace(anchor, anchor + "import { hasRequiredIcon, managedMediaPath } from './inspection-policy.mjs';\n", 1)

old = """      if (parsed.iconBlob && parsed.iconBlob.size <= 1048576 && ['image/png','image/jpeg','image/webp'].includes(parsed.iconBlob.type)) {
        const iconKey = `${id}.${parsed.iconBlob.type.split('/')[1] === 'jpeg' ? 'jpg' : parsed.iconBlob.type.split('/')[1]}`;
        const { error } = await db.storage.from('app-icons').upload(iconKey, parsed.iconBlob, { contentType: parsed.iconBlob.type, upsert: true });
        if (!error) Object.assign(inspection, { iconUrl: db.storage.from('app-icons').getPublicUrl(iconKey).data.publicUrl });
      }
      const { error } = await db.from('upload_candidates').update({ status: 'inspected', inspection, error: null }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
"""
new = """      if (parsed.iconBlob && parsed.iconBlob.size <= 1048576 && ['image/png','image/jpeg','image/webp'].includes(parsed.iconBlob.type)) {
        const iconKey = `${id}.${parsed.iconBlob.type.split('/')[1] === 'jpeg' ? 'jpg' : parsed.iconBlob.type.split('/')[1]}`;
        const { error } = await db.storage.from('app-icons').upload(iconKey, parsed.iconBlob, { contentType: parsed.iconBlob.type, upsert: true });
        if (!error) Object.assign(inspection, { iconUrl: db.storage.from('app-icons').getPublicUrl(iconKey).data.publicUrl });
      }
      if (!hasRequiredIcon(inspection)) {
        const reason = 'APK launcher icon could not be extracted. Upload a valid APK with a launcher icon or use the owner icon replacement flow before publishing.';
        await db.from('upload_candidates').update({ error: reason }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
        return json({ error: reason }, 422);
      }
      const { error } = await db.from('upload_candidates').update({ status: 'inspected', inspection, error: null }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
"""
if old not in s:
    raise SystemExit('icon extraction anchor not found')
s = s.replace(old, new, 1)

old = ".filter(path => /^(?:admin\\/[0-9a-f-]{36}|[0-9a-f-]{36})\\.(?:png|jpg|webp)$/.test(path));"
new = ".filter(path => managedMediaPath(path));"
if old not in s:
    raise SystemExit('media cleanup anchor not found')
s = s.replace(old, new, 1)

p.write_text(s)
