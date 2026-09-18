import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const VERIFICATION_HASH_SALT = 'securelinks:v1:dob:';

export function hashVerificationValue(value: string): string {
  return createHash('sha256').update(`${VERIFICATION_HASH_SALT}${value}`).digest('hex');
}

export function verifyVerificationValue(candidate: string, storedHash: string): boolean {
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;
  let b: Buffer;
  try {
    b = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  const candidateHash = hashVerificationValue(candidate);
  const a = Buffer.from(candidateHash, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function newDocumentId(): string {
  return randomUUID();
}

export function newAccessToken(): string {
  // 16 random bytes (128-bit entropy) -> 22 base64url chars. Keeps the SMS
  // URL short while remaining unguessable; server-side rate limiting and
  // the 15-minute lockout provide the remaining defence in depth.
  return randomBytes(16).toString('base64url');
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildAccessUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/d/${token}`;
}

export function documentS3Key(documentId: string): string {
  return `documents/${documentId}.pdf`;
}
