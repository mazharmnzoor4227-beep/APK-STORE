package com.apkstore.client;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

final class InstallCoordinator {
    private InstallCoordinator() {}

    static void install(Context context, File apk, String slug, String packageId) throws Exception {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(packageId);
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (FileInputStream source = new FileInputStream(apk);
                 OutputStream target = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = source.read(buffer)) != -1) target.write(buffer, 0, count);
                session.fsync(target);
            }
            Intent callback = new Intent(context, InstallResultReceiver.class).putExtra("slug", slug);
            PendingIntent result = PendingIntent.getBroadcast(context, id, callback,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(result.getIntentSender());
        } catch (Exception error) {
            installer.abandonSession(id);
            throw error;
        }
    }
}
