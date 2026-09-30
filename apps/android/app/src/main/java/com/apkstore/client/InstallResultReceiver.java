package com.apkstore.client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

public final class InstallResultReceiver extends BroadcastReceiver {
    static final String ACTION = "com.apkstore.client.INSTALL_RESULT";
    static final String PREFS = "install_results";
    // Sessions whose user-approval dialog was already launched. Guards against the
    // confirmation dialog appearing twice for a single install session.
    private static final java.util.Set<Integer> approvalLaunched =
            java.util.Collections.synchronizedSet(new java.util.HashSet<Integer>());

    @Override public void onReceive(Context context, Intent intent) {
        String slug = intent.getStringExtra("slug");
        if (slug == null || !slug.matches("[a-z0-9]+(-[a-z0-9]+)*")) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        int sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            if (sessionId != -1 && !approvalLaunched.add(sessionId)) return;
            Intent approval = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                    : intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (approval != null) {
                approval.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(approval);
            } else if (sessionId != -1) {
                approvalLaunched.remove(sessionId);
            }
            return;
        }
        if (sessionId != -1) approvalLaunched.remove(sessionId);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String value = status == PackageInstaller.STATUS_SUCCESS ? "Installed" :
                status == PackageInstaller.STATUS_FAILURE_ABORTED ? "Cancelled" :
                "Installation failed" + (message == null || message.isEmpty() ? " (code " + status + ")" : ": " + message);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(slug, value).apply();
        Intent update = new Intent(ACTION).setPackage(context.getPackageName()).putExtra("slug", slug);
        context.sendBroadcast(update);
    }
}
