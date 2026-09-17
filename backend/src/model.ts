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
  lockedUntil?: string;
}
