from pathlib import Path
p = Path('apps/android/app/src/main/java/com/apkstore/client/MainActivity.java')
s = p.read_text()
old = '''        } else {
            downloadErrors.put(slug, result);
            Long id = completedDownloads.get(slug);
            history.record(slug, slug, result.equals("Cancelled") ? "Cancelled" : "Failed", result,
                    id == null ? -1 : id, downloadPaths.getOrDefault(slug, ""), 100);
        }
'''
new = '''        } else {
            downloadErrors.put(slug, result);
            Long id = completedDownloads.get(slug);
            history.record(slug, slug, result.equals("Cancelled") ? "Cancelled" : "Failed", result,
                    id == null ? -1 : id, downloadPaths.getOrDefault(slug, ""), 100);
            if (selfUpdateApp != null && slug.equals(selfUpdateApp.optString("slug"))) {
                completedDownloads.remove(slug);
                if (id != null) ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                downloadPaths.remove(slug);
            }
        }
'''
if old not in s:
    raise SystemExit('install-result retry marker not found')
p.write_text(s.replace(old, new, 1))
