export function trustedIconSource(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    if (url.hostname === 'f-droid.org') {
      return (/^\/repo\/[A-Za-z0-9._-]+\/en-US\/icon_[A-Za-z0-9_%=-]+\.(?:png|webp|jpe?g)$/i.test(url.pathname) ||
              /^\/assets\/[A-Za-z0-9._%=-]+\.(?:png|webp|jpe?g)$/i.test(url.pathname));
    }
    if (url.hostname === 'raw.githubusercontent.com') {
      return /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/.+\.(?:png|webp|jpe?g)$/i.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}
