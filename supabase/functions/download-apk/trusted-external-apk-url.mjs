export function trustedExternalApkUrl(raw, { githubOwner, githubRepo, packageId }) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    if (url.hostname === 'github.com') {
      if (!githubOwner || !githubRepo) return false;
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      return parts.length === 6 &&
        parts[0].toLowerCase() === String(githubOwner).toLowerCase() &&
        parts[1].toLowerCase() === String(githubRepo).toLowerCase() &&
        parts[2] === 'releases' && parts[3] === 'download' &&
        parts[4].length > 0 && parts[5].length > 0 &&
        parts[5].toLowerCase().endsWith('.apk');
    }
    if (url.hostname === 'f-droid.org') {
      if (!packageId) return false;
      const escaped = String(packageId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^/repo/${escaped}_[0-9]+\\.apk$`, 'i').test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}
