type Candidate = { packageId?: unknown; certificateSha256?: unknown; versionCode?: unknown };
type Identity = { packageId: string; signerSha256: string; currentVersionCode: number };

export function validateStoreRelease(candidate: Candidate, identity: Identity): string | null {
  if (String(candidate.packageId ?? '') !== identity.packageId) return 'APK STORE package ID does not match the permanent package.';
  const signer = String(candidate.certificateSha256 ?? '').replaceAll(':', '').toLowerCase();
  const expected = identity.signerSha256.replaceAll(':', '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signer) || signer !== expected) return 'APK STORE signing certificate does not match the permanent signer.';
  const versionCode = Number(candidate.versionCode);
  if (!Number.isSafeInteger(versionCode) || versionCode <= identity.currentVersionCode) return 'APK STORE versionCode must be a higher integer than the current published version.';
  return null;
}
