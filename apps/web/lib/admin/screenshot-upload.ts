export function classifyScreenshotBytes(bytes: Uint8Array): 'webp' | null {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp';
  return null;
}

export function managedScreenshotPath(url: string, supabaseUrl: string): string | null {
  const prefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/app-screenshots/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  if (!/^admin\/[0-9a-f-]{36}\.webp$/i.test(path)) return null;
  return path;
}
