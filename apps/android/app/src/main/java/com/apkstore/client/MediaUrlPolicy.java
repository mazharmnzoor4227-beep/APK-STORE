package com.apkstore.client;

import java.net.URI;
import java.util.Locale;

final class MediaUrlPolicy {
    private MediaUrlPolicy() {}

    static boolean trusted(String raw, String supabaseBase) {
        if (raw == null || raw.isEmpty()) return false;
        try {
            URI uri = URI.create(raw);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getFragment() != null) return false;
            String host = uri.getHost();
            String path = uri.getPath();
            if (host == null || path == null) return false;

            if (raw.startsWith(supabaseBase + "/storage/v1/object/public/app-screenshots/") ||
                    raw.startsWith(supabaseBase + "/storage/v1/object/public/app-icons/")) return true;

            String lowerPath = path.toLowerCase(Locale.ROOT);
            boolean image = lowerPath.endsWith(".png") || lowerPath.endsWith(".webp") ||
                    lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg");
            if (!image) return false;

            if ("f-droid.org".equalsIgnoreCase(host)) {
                return path.matches("^/repo/[A-Za-z0-9._-]+/en-US/phoneScreenshots/[A-Za-z0-9._%=-]+\\.(?i:png|webp|jpe?g)$");
            }
            if ("raw.githubusercontent.com".equalsIgnoreCase(host)) {
                return path.matches("^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[^/]+/.+\\.(?i:png|webp|jpe?g)$");
            }
            return "apk-store-mazhar.mazharmanzoor4117.chatgpt.site".equalsIgnoreCase(host) && image;
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
