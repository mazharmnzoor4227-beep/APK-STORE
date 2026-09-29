export type ReviewFields = {
  slug: string; title: string; category: string; description: string; shortDescription: string;
  releaseNotes: string; license: string; sourceUrl: string; fdroidUrl: string;
  priceType: 'Free' | 'In-app purchases' | 'In-app purchases or Paid'; recommended: boolean;
};

function text(input: Record<string, unknown>, key: string, max: number, required = false) {
  const value = String(input[key] ?? '').trim();
  if (value.length > max || (required && !value)) throw new Error(`Invalid ${key}`);
  return value;
}
function url(input: Record<string, unknown>, key: string) {
  const value = text(input, key, 500);
  if (!value) return '';
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid ${key}`); }
  if (parsed.protocol !== 'https:') throw new Error(`Invalid ${key}`);
  return value;
}

export function normalizeReviewFields(input: Record<string, unknown>): ReviewFields {
  const slug = text(input, 'slug', 120, true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid slug');
  const price = String(input.priceType ?? 'Free');
  if (!['Free','In-app purchases','In-app purchases or Paid'].includes(price)) throw new Error('Invalid priceType');
  return {
    slug,
    title: text(input, 'title', 120, true),
    category: text(input, 'category', 80, true),
    description: text(input, 'description', 5000),
    shortDescription: text(input, 'shortDescription', 80),
    releaseNotes: text(input, 'releaseNotes', 5000),
    license: text(input, 'license', 80),
    sourceUrl: url(input, 'sourceUrl'),
    fdroidUrl: url(input, 'fdroidUrl'),
    priceType: price as ReviewFields['priceType'],
    recommended: input.recommended === true,
  };
}
