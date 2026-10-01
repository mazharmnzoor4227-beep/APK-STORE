package com.apkstore.client;

/**
 * Pure-Java validation rules for Supabase Auth forms.
 * Mirrors the website signup policy: minimum 6 characters, first character
 * uppercase A-Z, at least one digit, at least one special character.
 * No Android dependencies so it can be unit-tested on the JVM.
 */
final class AuthPolicy {
    private AuthPolicy() {}

    /** Returns null when the email looks valid, otherwise an English error message. */
    static String emailError(String email) {
        String value = email == null ? "" : email.trim();
        if (value.isEmpty()) return "Enter your email address.";
        int at = value.indexOf('@');
        if (at <= 0 || at != value.lastIndexOf('@') || at >= value.length() - 1) {
            return "Enter a valid email address.";
        }
        String domain = value.substring(at + 1);
        if (!domain.contains(".") || domain.startsWith(".") || domain.endsWith(".")) {
            return "Enter a valid email address.";
        }
        return null;
    }

    /** Returns null when the login password is acceptable, otherwise an English error message. */
    static String loginPasswordError(String password) {
        if (password == null || password.isEmpty()) return "Enter your password.";
        return null;
    }

    /** Returns null when the signup password meets the policy, otherwise an English error message. */
    static String signupPasswordError(String password) {
        if (password == null || password.isEmpty()) return "Create a password.";
        if (password.length() < 6) return "Password must be at least 6 characters.";
        char first = password.charAt(0);
        if (first < 'A' || first > 'Z') return "Password must start with a capital letter (A-Z).";
        boolean digit = false, special = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (c >= '0' && c <= '9') digit = true;
            else if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z')) special = true;
        }
        if (!digit) return "Password must include at least one number.";
        if (!special) return "Password must include at least one special character (e.g. @ # ! ?).";
        return null;
    }

    /** Short hint shown under the signup password field. */
    static String signupPasswordHint() {
        return "Min 6 characters, starts with A-Z, includes a number and a special character.";
    }

    /** Maps common Supabase Auth API errors to friendly English messages. */
    static String friendlyError(String codeOrMessage) {
        String m = codeOrMessage == null ? "" : codeOrMessage.toLowerCase(java.util.Locale.US);
        if (m.contains("invalid login credentials") || m.contains("invalid_credentials")) {
            return "Incorrect email or password.";
        }
        if (m.contains("email not confirmed") || m.contains("email_not_confirmed")) {
            return "Email not confirmed. Open the confirmation link in your inbox (check spam) first.";
        }
        if (m.contains("user already registered") || m.contains("already registered") || m.contains("already exists")) {
            return "This email is already registered. Try signing in instead.";
        }
        if (m.contains("password") && (m.contains("weak") || m.contains("short") || m.contains("length"))) {
            return "Password is too weak. " + signupPasswordHint();
        }
        if (m.contains("rate limit") || m.contains("too many") || m.contains("over_email_send_rate_limit")
                || m.contains("over_request_rate_limit")) {
            return "Too many attempts. Wait a few minutes and try again.";
        }
        if (m.contains("network") || m.contains("timeout") || m.contains("unable to resolve")
                || m.contains("failed to connect") || m.contains("econnrefused")) {
            return "Network error. Check your connection and try again.";
        }
        if (m.contains("signup is disabled") || m.contains("signups not allowed")) {
            return "New signups are disabled right now.";
        }
        return "Something went wrong. Please try again.";
    }
}
