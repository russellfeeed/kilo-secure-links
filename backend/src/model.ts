export interface DocumentItem {
  documentId: string;
  customerId: string;
  recipientId: string;
  verificationValueHash: string;
  expiryDate: string;
  originalFilename: string;
  documentReference: string;
  accessTokenHash: string;
  s3Key: string;
  viewedStatus: boolean;
  createdAt: string;
  fallbackStatus: string;
  fallbackTriggeredAt?: string;
  ttl: number;
  /** REQ-015: decoded PDF size in bytes, for storage utilisation reporting. */
  sizeBytes?: number;
  /** REQ-018: ordered verification factors on this document (dob always first). */
  verificationFactors?: StoredFactor[];
  /** REQ-024: branding template id applied on the patient page. */
  template?: string;
}

export type AuditEventType =
  | 'upload'
  | 'access_attempt'
  | 'success'
  | 'failure'
  | 'lockout'
  | 'lockout_reset'
  | 'fallback'
  | 'expired'
  | 'deleted';

/** REQ-018: one stored verification factor on a document. */
export interface StoredFactor {
  type: string;
  hash: string;
}

export interface AuditEvent {
  documentId: string;
  eventId: string;
  timestamp: string;
  customerId: string;
  type: AuditEventType;
  actor: string;
  detail?: string;
}

export interface VerificationCounter {
  documentId: string;
  failedCount: number;
  /** Lifetime failed verification attempts (never reset). */
  totalFailed?: number;
  lockedUntil?: string;
}
