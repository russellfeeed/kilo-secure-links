import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Pluggable verification factors (REQ-018). A factor pairs a stable type key
 * with a salt prefix used for hashing candidate values. New factors (OTP,
 * postcode, account number, ...) are added with one registerFactor call and
 * zero changes to the handlers.
 */

export interface StoredFactor {
  type: string;
  hash: string;
}

export interface FactorDefinition {
  type: string;
  saltPrefix: string;
}

const FACTORS: Map<string, FactorDefinition> = new Map();

export function registerFactor(def: FactorDefinition): void {
  if (FACTORS.has(def.type)) {
    throw new Error(`Verification factor already registered: ${def.type}`);
  }
  FACTORS.set(def.type, def);
}

registerFactor({ type: 'dob', saltPrefix: 'securelinks:v1:dob:' });
registerFactor({ type: 'postcode', saltPrefix: 'securelinks:v1:postcode:' });
registerFactor({ type: 'accountNumber', saltPrefix: 'securelinks:v1:account:' });
registerFactor({ type: 'otp', saltPrefix: 'securelinks:v1:otp:' });

export function isRegisteredFactor(type: string): boolean {
  return FACTORS.has(type);
}

export function listFactorTypes(): string[] {
  return [...FACTORS.keys()].sort();
}

export function hashFactor(type: string, value: string): string {
  const def = FACTORS.get(type);
  if (!def) {
    throw new Error(`Unknown verification factor type: ${type}`);
  }
  return createHash('sha256').update(`${def.saltPrefix}${value}`).digest('hex');
}

export function verifyFactor(type: string, candidate: string, storedHash: string): boolean {
  if (!FACTORS.has(type)) return false;
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  const candidateHash = Buffer.from(hashFactor(type, candidate), 'hex');
  return stored.length === candidateHash.length && candidateHash.length > 0 && timingSafeEqual(candidateHash, stored);
}

/**
 * Compose the ordered factor list stored on a document: the primary factor
 * (DOB today) first, then any additional factors requested at upload.
 * Unknown or duplicate factor types are dropped defensively.
 */
export function buildFactorList(
  primary: StoredFactor,
  additional: StoredFactor[] | undefined,
): StoredFactor[] {
  const out: StoredFactor[] = [{ type: primary.type, hash: primary.hash }];
  const seen = new Set<string>([primary.type]);
  for (const factor of additional ?? []) {
    if (
      factor &&
      typeof factor.type === 'string' &&
      typeof factor.hash === 'string' &&
      factor.type !== primary.type &&
      FACTORS.has(factor.type) &&
      !seen.has(factor.type)
    ) {
      out.push({ type: factor.type, hash: factor.hash });
      seen.add(factor.type);
    }
  }
  return out;
}

/**
 * Choose the candidate value for a factor from the request body.
 * DOB comes from the dedicated field; other factors from factorValues[type].
 */
export function candidateFor(
  factorType: string,
  body: { dateOfBirth?: string; factorValues?: Record<string, string> },
): string | undefined {
  if (factorType === 'dob') {
    return body.dateOfBirth?.trim();
  }
  const value = body.factorValues?.[factorType];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
