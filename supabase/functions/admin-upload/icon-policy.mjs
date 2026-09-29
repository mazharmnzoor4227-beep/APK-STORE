const ALLOWED_ICON_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_ICON_BYTES = 1_048_576;

export function iconExtractionProblem(iconBlob) {
  if (!iconBlob) return 'APK launcher icon could not be extracted. Upload a replacement icon before publishing.';
  if (!Number.isFinite(iconBlob.size) || iconBlob.size <= 0) return 'APK launcher icon is empty.';
  if (iconBlob.size > MAX_ICON_BYTES) return 'APK launcher icon exceeds the 1 MB limit.';
  if (!ALLOWED_ICON_TYPES.has(String(iconBlob.type || '').toLowerCase()))
    return 'APK launcher icon must resolve to PNG, JPEG or WebP.';
  return '';
}

export function isPublishableIconUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
