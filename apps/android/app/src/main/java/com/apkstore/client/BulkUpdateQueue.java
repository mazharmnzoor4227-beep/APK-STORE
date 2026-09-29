package com.apkstore.client;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;

final class BulkUpdateQueue {
    private final ArrayDeque<String> pending = new ArrayDeque<>();
    private String active;

    synchronized void reset(List<String> slugs) {
        pending.clear();
        active = null;
        HashSet<String> seen = new HashSet<>();
        if (slugs == null) return;
        for (String slug : slugs) {
            if (slug == null) continue;
            String clean = slug.trim();
            if (!clean.isEmpty() && seen.add(clean)) pending.add(clean);
        }
    }

    synchronized String startNext() {
        if (active != null) return null;
        active = pending.pollFirst();
        return active;
    }

    synchronized void complete(String slug) {
        if (active != null && active.equals(slug)) active = null;
    }

    synchronized boolean isActive(String slug) {
        return active != null && active.equals(slug);
    }

    synchronized boolean isIdle() {
        return active == null && pending.isEmpty();
    }
}
