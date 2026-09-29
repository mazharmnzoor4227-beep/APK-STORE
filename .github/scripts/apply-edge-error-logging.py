from pathlib import Path
p=Path('supabase/functions/admin-upload/index.ts')
s=p.read_text()
old="""  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Upload unavailable';
    if (inspecting) await db.from('upload_candidates').update({ error: detail.slice(0, 300) }).eq('id', inspecting).eq('owner_id', user.id).eq('status', 'uploaded');
    return json({ error: detail.replace(/https?:\\/\\/[^\\s]+/g, '[private APK URL]') }, 500);
  }
});
"""
new="""  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Upload unavailable';
    if (inspecting) await db.from('upload_candidates').update({ error: detail.slice(0, 300) }).eq('id', inspecting).eq('owner_id', user.id).eq('status', 'uploaded');
    const safeDetail = detail.replace(/https?:\\/\\/[^\\s]+/g, '[url]').replace(/bearer\\s+[^\\s]+/gi, 'Bearer [redacted]').slice(0, 1000);
    await db.from('admin_error_events').insert({ source: 'edge/admin-upload', message: safeDetail || 'Upload unavailable', details: inspecting ? { candidateId: inspecting } : {} });
    return json({ error: safeDetail.replace('[url]', '[private APK URL]') }, 500);
  }
});
"""
if old not in s: raise SystemExit('admin-upload catch anchor missing')
p.write_text(s.replace(old,new,1))
