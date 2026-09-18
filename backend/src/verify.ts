import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { db, table } from './db.js';
import { hashAccessToken } from './documents.js';
import { buildFactorList, candidateFor, verifyFactor } from './factors.js';
import { emitCountMetric } from './metrics.js';
import { json, nowIso } from './http.js';
import type { AuditEventType, DocumentItem, VerificationCounter } from './model.js';

const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');
const AUDIT_TABLE = table(process.env.AUDIT_TABLE, 'securelinks-dev-audit-events');
const COUNTERS_TABLE = table(process.env.COUNTERS_TABLE, 'securelinks-dev-verification-counters');
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET ?? '';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const PRESIGN_SECONDS = 300;

let s3: S3Client | null = null;
function s3client(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

interface VerifyBody {
  token?: string;
  dateOfBirth?: string;
  /** REQ-018: candidate values for additional factors, keyed by factor type. */
  factorValues?: Record<string, string>;
}

async function audit(documentId: string, customerId: string, type: AuditEventType, actor: string, detail?: string): Promise<void> {
  await db().send(
    new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        documentId,
        eventId: randomUUID(),
        timestamp: nowIso(),
        customerId,
        type,
        actor,
        ...(detail !== undefined ? { detail } : {}),
      },
      ConditionExpression: 'attribute_not_exists(eventId)',
    }),
  );
}

export function lockoutUntilFrom(failedCount: number, nowMs: number): string | undefined {
  if (failedCount >= MAX_ATTEMPTS) {
    return new Date(nowMs + LOCKOUT_MINUTES * 60_000).toISOString();
  }
  return undefined;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!DOCUMENTS_BUCKET) {
    return json(500, { message: 'Document storage is not configured.' });
  }

  let body: VerifyBody;
  try {
    body = event.body ? (JSON.parse(event.body) as VerifyBody) : {};
  } catch {
    return json(400, { message: 'Request body must be valid JSON.' });
  }

  const token = body.token?.trim();
  const dateOfBirth = body.dateOfBirth?.trim();
  if (!token || !dateOfBirth) {
    return json(400, { message: 'Fields token and dateOfBirth are required.' });
  }

  const tokenHash = hashAccessToken(token);
  let lookup;
  try {
    lookup = await db().send(
      new QueryCommand({
        TableName: DOCUMENTS_TABLE,
        IndexName: 'byAccessToken',
        KeyConditionExpression: 'accessTokenHash = :h',
        ExpressionAttributeValues: { ':h': tokenHash },
        Limit: 1,
      }),
    );
  } catch (err) {
    console.error('byAccessToken query failed, falling back to scan', err);
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    lookup = await db().send(
      new ScanCommand({
        TableName: DOCUMENTS_TABLE,
        FilterExpression: 'accessTokenHash = :h',
        ExpressionAttributeValues: { ':h': tokenHash },
        Limit: 1,
      }),
    );
  }

  const docId = (lookup.Items?.[0] as { documentId?: string } | undefined)?.documentId;
  if (!docId) {
    return json(404, { message: 'This link is invalid or has expired.' });
  }
  const full = await db().send(
    new GetCommand({ TableName: DOCUMENTS_TABLE, Key: { documentId: docId } }),
  );
  const doc = (full.Item ?? null) as unknown as Partial<DocumentItem> | null;
  if (!doc) {
    return json(404, { message: 'This link is invalid or has expired.' });
  }
  const missingFields = ['documentId', 'customerId', 'expiryDate', 's3Key', 'verificationValueHash'].filter(
    (f) => typeof (doc as Record<string, unknown>)[f] !== 'string' || ((doc as Record<string, unknown>)[f] as string).length === 0,
  );
  if (missingFields.length > 0) {
    return json(404, { message: 'This link is invalid or has expired.' });
  }

  if (Date.parse(doc.expiryDate as string) <= Date.now()) {
    await audit(doc.documentId as string, doc.customerId as string, 'expired', 'recipient:anonymous');
    return json(410, { message: 'This link has expired.' });
  }

  const documentId = doc.documentId as string;
  const customerId = doc.customerId as string;

  const counterRes = await db().send(
    new GetCommand({ TableName: COUNTERS_TABLE, Key: { documentId } }),
  );
  const counter = (counterRes.Item ?? { failedCount: 0 }) as VerificationCounter;
  if (typeof counter.lockedUntil === 'string' && Date.parse(counter.lockedUntil) > Date.now()) {
    await audit(documentId, customerId, 'access_attempt', 'recipient:anonymous', 'locked');
    return json(429, { message: 'Too many attempts. Try again later.', lockedUntil: counter.lockedUntil });
  }

  const storedFactors = buildFactorList(
    { type: 'dob', hash: doc.verificationValueHash as string },
    doc.verificationFactors,
  );
  const allMatch = storedFactors.every((factor) => {
    const candidate = candidateFor(factor.type, body);
    return typeof candidate === 'string' && verifyFactor(factor.type, candidate, factor.hash);
  });

  if (!allMatch) {
    const failedCount = Number(counter.failedCount ?? 0) + 1;
    const lockedUntil = lockoutUntilFrom(failedCount, Date.now());
    await db().send(
      new UpdateCommand({
        TableName: COUNTERS_TABLE,
        Key: { documentId },
        // failedCount resets on success; totalFailed is a lifetime tally for support reporting.
        UpdateExpression: lockedUntil
          ? 'SET failedCount = :c, lockedUntil = :l ADD totalFailed :one'
          : 'SET failedCount = :c ADD totalFailed :one',
        ExpressionAttributeValues: lockedUntil
          ? { ':c': failedCount, ':l': lockedUntil, ':one': 1 }
          : { ':c': failedCount, ':one': 1 },
      }),
    );
    emitCountMetric('VerificationFailure', { CustomerId: customerId });
    await audit(documentId, customerId, lockedUntil ? 'lockout' : 'failure', 'recipient:anonymous');
    if (lockedUntil) {
      return json(429, { message: 'Too many attempts. Try again later.', lockedUntil });
    }
    return json(401, { message: 'Verification details do not match our records.' });
  }

  await db().send(
    new UpdateCommand({
      TableName: COUNTERS_TABLE,
      Key: { documentId },
      UpdateExpression: 'SET failedCount = :zero REMOVE lockedUntil',
      ExpressionAttributeValues: { ':zero': 0 },
    }),
  );

  const alreadyViewed = doc.viewedStatus === true;
  if (!alreadyViewed) {
    await db().send(
      new UpdateCommand({
        TableName: DOCUMENTS_TABLE,
        Key: { documentId },
        UpdateExpression: 'SET viewedStatus = :true',
        ExpressionAttributeValues: { ':true': true },
      }),
    );
  }

  await audit(documentId, customerId, 'success', 'recipient:anonymous');
  emitCountMetric('DocumentVerified', { CustomerId: customerId });

  const url = await getSignedUrl(
    s3client(),
    new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: doc.s3Key as string,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: `inline; filename="${String(doc.originalFilename ?? 'document.pdf').replace(/"/g, '')}"`,
    }),
    { expiresIn: PRESIGN_SECONDS },
  );

  return json(200, {
    documentId,
    documentReference: String(doc.documentReference ?? ''),
    downloadUrl: url,
    expiresInSeconds: PRESIGN_SECONDS,
  });
}
