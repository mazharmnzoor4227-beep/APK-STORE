import { createHmac, timingSafeEqual } from 'node:crypto';

export type UploadInput = { ownerId: string | null; filename: string; byteSize: number };
export type InspectedApk = { packageId: string; versionCode: number; versionName: string; certificateSha256: string; apkSha256: string; byteSize: number };
export type Candidate = { id: string; expiresAt: number; byteSize: number; status: string };

export async function createCandidateUpload(input: UploadInput, provider: { create: (input: UploadInput) => Promise<{ id: string; signedUrl: string }> }) {
  if (!input.ownerId) throw new Error('Owner authorization required');
  if (!/\.apk$/i.test(input.filename)) throw new Error('APK file required');
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) throw new Error('Invalid file size');
  if (input.byteSize > 50 * 1024 * 1024) throw new Error('APK exceeds the 50 MB storage limit');
  return provider.create(input);
}

export async function recordInspection(id: string, metadata: InspectedApk, repository: { get: (id: string) => Promise<Candidate | null>; record: (id: string, metadata: InspectedApk) => Promise<void> }) {
  const candidate = await repository.get(id);
  if (!candidate) throw new Error('Candidate not found');
  if (candidate.expiresAt < Date.now()) throw new Error('Candidate expired');
  if (candidate.status !== 'uploaded') throw new Error('Upload not complete');
  if (!/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+$/.test(metadata.packageId)) throw new Error('Invalid package ID');
  if (!Number.isSafeInteger(metadata.versionCode) || metadata.versionCode <= 0 || !metadata.versionName) throw new Error('Invalid version');
  if (!/^[a-f0-9]{64}$/.test(metadata.certificateSha256) || !/^[a-f0-9]{64}$/.test(metadata.apkSha256)) throw new Error('Invalid APK signature or checksum');
  if (metadata.byteSize !== candidate.byteSize) throw new Error('APK size mismatch');
  await repository.record(id, metadata);
}

export function verifyInspectionSignature(body: string, signature: string, secret: string): boolean {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.slice(7), 'hex'));
}
