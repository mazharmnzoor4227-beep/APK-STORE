export function managedIconPath(url: string, supabaseUrl: string): string | null {
  const prefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/app-icons/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  if (!/^(?:admin|admin-icons)\/[0-9a-f-]{36}\.(?:png|webp|jpg)$/i.test(path)) return null;
  return path;
}

export function classifyIconBytes(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  return null;
}
