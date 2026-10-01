package com.apkstore.client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/**
 * Receives the result of {@link PackageInstaller#uninstall(String, android.content.IntentSender)}.
 * The system shows its own official uninstall confirmation dialog; this receiver only
 * reports the outcome back to the user.
 */
public final class UninstallResultReceiver extends BroadcastReceiver {
    static final String ACTION = "com.apkstore.client.UNINSTALL_RESULT";

    @Override public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        String pkg = intent.getStringExtra("pkg");
        if (pkg == null || pkg.isEmpty()) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(context, "Uninstall ho gaya", Toast.LENGTH_SHORT).show();
            context.getSharedPreferences("uninstall_results", Context.MODE_PRIVATE)
                    .edit().putLong(pkg, System.currentTimeMillis()).apply();
        } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            Toast.makeText(context, "Uninstall cancel ho gaya", Toast.LENGTH_SHORT).show();
        } else {
            String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(context,
                    "Uninstall nahi ho saka" + (message == null || message.isEmpty() ? "" : ": " + message),
                    Toast.LENGTH_LONG).show();
        }
    }
}
