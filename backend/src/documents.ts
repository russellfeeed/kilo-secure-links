import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashFactor, verifyFactor } from './factors.js';

export function hashVerificationValue(value: string): string {
  return hashFactor('dob', value);
}

export function verifyVerificationValue(candidate: string, storedHash: string): boolean {
  return verifyFactor('dob', candidate, storedHash);
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
