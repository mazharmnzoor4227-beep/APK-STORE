const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extensionForContentType(contentType) {
  switch (String(contentType || '').toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return null;
  }
}

export function durableIconPath(appId, contentType) {
  if (!UUID.test(String(appId || ''))) return null;
  const extension = extensionForContentType(contentType);
  return extension ? `proxy/${appId}.${extension}` : null;
}
