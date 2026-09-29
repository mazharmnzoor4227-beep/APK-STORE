from pathlib import Path

p = Path('apps/android/app/src/main/java/com/apkstore/client/MainActivity.java')
s = p.read_text()

replacements = [
('''        } else {
            downloadErrors.put(slug, result);
            Long id = completedDownloads.get(slug);
            history.record(slug, slug, result.equals("Cancelled") ? "Cancelled" : "Failed", result,
                    id == null ? -1 : id, downloadPaths.getOrDefault(slug, ""), 100);
        }
''', '''        } else {
            downloadErrors.put(slug, result);
            Long id = completedDownloads.get(slug);
            history.record(slug, slug, result.equals("Cancelled") ? "Cancelled" : "Failed", result,
                    id == null ? -1 : id, downloadPaths.getOrDefault(slug, ""), 100);
            if (!"Cancelled".equals(result))
                CrashReporter.recordHandled(this, "install_failed", result, new IllegalStateException(result));
        }
'''),
('''        } catch (Exception e) { downloadErrors.put(slug, "Download could not start: " + e.getMessage()); refreshDetail(); }
''', '''        } catch (Exception e) {
            downloadErrors.put(slug, "Download could not start: " + e.getMessage());
            CrashReporter.recordHandled(this, "download_start_failed", downloadErrors.get(slug), e);
            refreshDetail();
        }
'''),
('''            } catch (Exception error) {
                runOnUiThread(() -> {
                    downloadErrors.put(slug, error.getMessage() == null ? "APK verification failed." : error.getMessage());
                    completedDownloads.remove(slug);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                    refreshDetail();
                });
            }
''', '''            } catch (Exception error) {
                CrashReporter.recordHandled(this, "install_verification_failed",
                        error.getMessage() == null ? "APK verification failed." : error.getMessage(), error);
                runOnUiThread(() -> {
                    downloadErrors.put(slug, error.getMessage() == null ? "APK verification failed." : error.getMessage());
                    completedDownloads.remove(slug);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                    refreshDetail();
                });
            }
'''),
('''                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        cancelDownload(slug); downloadErrors.put(slug, "Download failed (" + reason + "). Tap Install to retry.");
                        history.record(slug, slug, "Failed", downloadErrors.get(slug), id, "", 0);
                        refreshDetail(); return;
                    }
''', '''                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        cancelDownload(slug); downloadErrors.put(slug, "Download failed (" + reason + "). Tap Install to retry.");
                        history.record(slug, slug, "Failed", downloadErrors.get(slug), id, "", 0);
                        CrashReporter.recordHandled(MainActivity.this, "download_failed", downloadErrors.get(slug),
                                new IllegalStateException("DownloadManager reason=" + reason));
                        refreshDetail(); return;
                    }
'''),
('''                } catch (Exception e) { cancelDownload(slug); downloadErrors.put(slug, "Download failed. Tap Install to retry."); refreshDetail(); }
''', '''                } catch (Exception e) {
                    cancelDownload(slug); downloadErrors.put(slug, "Download failed. Tap Install to retry.");
                    CrashReporter.recordHandled(MainActivity.this, "download_poll_failed", downloadErrors.get(slug), e);
                    refreshDetail();
                }
''')
]

for old, new in replacements:
    if old not in s:
        raise SystemExit('required anchor missing: ' + old[:80].replace('\n',' '))
    s = s.replace(old, new, 1)

p.write_text(s)
