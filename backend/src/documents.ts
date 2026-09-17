import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const VERIFICATION_HASH_SALT = 'securelinks:v1:dob:';

export function hashVerificationValue(value: string): string {
  return createHash('sha256').update(`${VERIFICATION_HASH_SALT}${value}`).digest('hex');
}

export function verifyVerificationValue(candidate: string, storedHash: string): boolean {
  const candidateHash = hashVerificationValue(candidate);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newDocumentId(): string {
  return randomUUID();
}

export function newAccessToken(): string {
  return randomBytes(32).toString('base64url');
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
