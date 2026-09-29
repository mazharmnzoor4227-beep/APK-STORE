export async function cropSquareIcon(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = Math.min(bitmap.width, bitmap.height);
    if (size < 32) throw new Error('Icon is too small');
    const sx = Math.floor((bitmap.width - size) / 2);
    const sy = Math.floor((bitmap.height - size) / 2);
    const outputSize = Math.min(512, size);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize; canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image crop is unavailable');
    context.drawImage(bitmap, sx, sy, size, size, 0, 0, outputSize, outputSize);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image crop failed')), 'image/png', 0.95));
    return new File([blob], 'replacement-icon.png', { type: 'image/png' });
  } finally { bitmap.close(); }
}
