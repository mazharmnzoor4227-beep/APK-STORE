package com.apkstore.client;

import android.content.Context;
import android.os.CancellationSignal;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Google sign-in via Android Credential Manager. Returns a Google ID token
 * whose audience is the project's Web OAuth client, which Supabase exchanges
 * for a session (same Google setup the website already uses).
 * Callbacks arrive on a background thread; callers must hop to the UI thread.
 */
final class GoogleSignInHelper {
    interface Callback {
        /** idToken is non-null on success; on failure error holds a friendly English message. */
        void onResult(String idToken, String error);
    }

    private GoogleSignInHelper() {}

    static void signIn(Context context, String webClientId, Callback callback) {
        if (webClientId == null || webClientId.trim().isEmpty()) {
            callback.onResult(null, "Google sign-in is not set up yet.");
            return;
        }
        try {
            GetGoogleIdOption option = new GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(webClientId.trim())
                    .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build();
            CredentialManager manager = CredentialManager.create(context);
            ExecutorService exec = Executors.newSingleThreadExecutor();
            manager.getCredentialAsync(context, request, new CancellationSignal(), exec,
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            try {
                                GoogleIdTokenCredential credential =
                                        GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                                String token = credential.getIdToken();
                                if (token == null || token.isEmpty()) {
                                    callback.onResult(null, "Google sign-in failed. Please try again.");
                                } else {
                                    callback.onResult(token, null);
                                }
                            } catch (Exception e) {
                                callback.onResult(null, "Google sign-in failed. Please try again.");
                            } finally {
                                exec.shutdown();
                            }
                        }

                        @Override
                        public void onError(GetCredentialException e) {
                            // Note: Play Services funnels both a user-dismissed dialog AND a
                            // platform refusal (e.g. app not registered with Google) through
                            // GetCredentialCancellationException. A refusal carries a numeric
                            // status like "[16] ..." in the message; a real dismissal does not.
                            String type = e == null ? "" : e.getClass().getSimpleName();
                            String detail = e == null || e.getMessage() == null ? "" : e.getMessage();
                            android.util.Log.e("GoogleSignIn", "getCredential failed: " + type + ": " + detail);
                            String msg;
                            if (type.contains("NoCredential")) {
                                msg = "No Google account found on this device.";
                            } else if (type.contains("Cancellation") && !detail.matches("(?s).*\\[\\d+\\].*")) {
                                msg = "Google sign-in was cancelled.";
                            } else {
                                msg = "Google sign-in failed. Please try again.";
                            }
                            callback.onResult(null, msg);
                            exec.shutdown();
                        }
                    });
        } catch (Exception e) {
            callback.onResult(null, "Google sign-in is unavailable on this device.");
        }
    }
}
