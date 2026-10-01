package com.apkstore.client;

import org.junit.Test;
import static org.junit.Assert.*;

/** JVM unit tests for the auth validation policy (mirrors the website signup rules). */
public class AuthPolicyTest {
    @Test public void email_valid() {
        assertNull(AuthPolicy.emailError("user@example.com"));
        assertNull(AuthPolicy.emailError("  a.b+1@sub.domain.co  "));
    }
    @Test public void email_invalid() {
        assertEquals("Enter your email address.", AuthPolicy.emailError(""));
        assertEquals("Enter your email address.", AuthPolicy.emailError("   "));
        assertEquals("Enter a valid email address.", AuthPolicy.emailError("no-at-sign"));
        assertEquals("Enter a valid email address.", AuthPolicy.emailError("a@b@c.com"));
        assertEquals("Enter a valid email address.", AuthPolicy.emailError("a@nodot"));
        assertEquals("Enter a valid email address.", AuthPolicy.emailError("a@.com"));
    }
    @Test public void loginPassword() {
        assertNull(AuthPolicy.loginPasswordError("x"));
        assertEquals("Enter your password.", AuthPolicy.loginPasswordError(""));
        assertEquals("Enter your password.", AuthPolicy.loginPasswordError(null));
    }
    @Test public void signupPassword_valid() {
        assertNull(AuthPolicy.signupPasswordError("Abc1@x"));
        assertNull(AuthPolicy.signupPasswordError("Z9#abcdef"));
    }
    @Test public void signupPassword_policy() {
        assertEquals("Password must be at least 6 characters.", AuthPolicy.signupPasswordError("Ab1@"));
        assertEquals("Password must start with a capital letter (A-Z).", AuthPolicy.signupPasswordError("abc1@x"));
        assertEquals("Password must include at least one number.", AuthPolicy.signupPasswordError("Abcd@x"));
        assertEquals("Password must include at least one special character (e.g. @ # ! ?).",
                AuthPolicy.signupPasswordError("Abcd1x"));
    }
    @Test public void friendlyErrors() {
        assertEquals("Incorrect email or password.", AuthPolicy.friendlyError("Invalid login credentials"));
        assertEquals("Email not confirmed. Open the confirmation link in your inbox (check spam) first.",
                AuthPolicy.friendlyError("Email not confirmed"));
        assertEquals("This email is already registered. Try signing in instead.",
                AuthPolicy.friendlyError("User already registered"));
        assertEquals("Too many attempts. Wait a few minutes and try again.",
                AuthPolicy.friendlyError("over_email_send_rate_limit"));
        assertEquals("Network error. Check your connection and try again.",
                AuthPolicy.friendlyError("Unable to resolve host"));
        assertEquals("Something went wrong. Please try again.", AuthPolicy.friendlyError("weird-new-error-xyz"));
    }
    @Test public void session_roundTrip() {
        long now = System.currentTimeMillis();
        AuthSession s = AuthSession.fromParts("acc|tok", "ref|tok", 3600, "user-id-1", "u@e.com", now);
        assertNotNull(s);
        AuthSession back = AuthSession.deserialize(s.serialize());
        assertNotNull(back);
        assertEquals("u@e.com", back.email);
        assertEquals("acc|tok", back.accessToken);
        assertEquals("ref|tok", back.refreshToken);
        assertEquals("user-id-1", back.userId);
        assertFalse(back.needsRefresh(now));
        assertTrue(back.needsRefresh(now + 3600_000L));
    }
    @Test public void session_invalid() {
        assertNull(AuthSession.deserialize("garbage"));
        assertNull(AuthSession.deserialize(""));
        assertNull(AuthSession.deserialize(null));
        assertNull(AuthSession.fromParts("", "r", 1, "u", "e", System.currentTimeMillis()));
        assertNull(AuthSession.fromParts(null, "r", 1, "u", "e", System.currentTimeMillis()));
    }
}
