export function hasRequiredIcon(inspection) {
  return typeof inspection?.iconUrl === 'string' && inspection.iconUrl.trim().length > 0;
}

export function managedMediaPath(path) {
  return /^(?:(?:admin|admin-icons)\/[0-9a-f-]{36}|[0-9a-f-]{36})\.(?:png|jpg|webp)$/.test(String(path || ''));
}
