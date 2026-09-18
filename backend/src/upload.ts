import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { db, table } from './db.js';
import {
  buildAccessUrl,
  documentS3Key,
  hashAccessToken,
  hashVerificationValue,
  newAccessToken,
  newDocumentId,
} from './documents.js';
import { buildFactorList, hashFactor, isRegisteredFactor } from './factors.js';
import { emitCountMetric } from './metrics.js';
import { json, nowIso, supportActor } from './http.js';
import type { DocumentItem, StoredFactor } from './model.js';


const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');
const AUDIT_TABLE = table(process.env.AUDIT_TABLE, 'securelinks-dev-audit-events');
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET ?? '';
const ACCESS_URL_BASE = process.env.ACCESS_URL_BASE ?? '';

let s3: S3Client | null = null;
function s3client(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

interface UploadBody {
  customerId?: string;
  recipientId?: string;
  verificationValue?: string;
  expiryDate?: string;
  originalFilename?: string;
  documentReference?: string;
  pdfBase64?: string;
  /** REQ-018: optional extra verification factors (e.g. postcode, accountNumber). */
  additionalFactors?: Array<{ type?: string; value?: string }>;
}

const REQUIRED_FIELDS: Array<keyof UploadBody> = [
  'customerId',
  'recipientId',
  'verificationValue',
  'expiryDate',
  'originalFilename',
  'documentReference',
  'pdfBase64',
];

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function isPdf(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

function expiryToTtl(expiryDate: string): number | null {
  const ms = Date.parse(expiryDate);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function validateUploadBody(body: UploadBody): { ok: true } | { ok: false; missing: string[] } {
  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = body[f];
    return typeof v !== 'string' || v.trim().length === 0;
  });
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!DOCUMENTS_BUCKET) {
    return json(500, { message: 'Document storage is not configured.' });
  }

  let body: UploadBody;
  try {
    body = event.body ? (JSON.parse(event.body) as UploadBody) : {};
  } catch {
    return json(400, { message: 'Request body must be valid JSON.' });
  }

  const validation = validateUploadBody(body);
  if (!validation.ok) {
    return json(400, {
      message: 'Missing or empty required fields.',
      missing: validation.missing,
    });
  }

  const customerId = String(body.customerId).trim();
  const recipientId = String(body.recipientId).trim();
  const verificationValue = String(body.verificationValue).trim();
  const expiryDate = String(body.expiryDate).trim();
  const originalFilename = String(body.originalFilename).trim();
  const documentReference = String(body.documentReference).trim();

  const ttl = expiryToTtl(expiryDate);
  if (ttl === null) {
    return json(400, { message: 'Field expiryDate must be a valid date.' });
  }
  if (ttl * 1000 <= Date.now()) {
    return json(400, { message: 'Field expiryDate must be in the future.' });
  }

  let pdf: Buffer;
  try {
    pdf = Buffer.from(String(body.pdfBase64), 'base64');
  } catch {
    return json(400, { message: 'Field pdfBase64 must be valid Base64.' });
  }
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) {
    return json(400, { message: `Field pdfBase64 must decode to 1-${MAX_PDF_BYTES} bytes.` });
  }
  if (!isPdf(pdf)) {
    return json(400, { message: 'Field pdfBase64 must decode to a PDF document.' });
  }

  const documentId = newDocumentId();
  const accessToken = newAccessToken();
  const createdAt = nowIso();
  const s3Key = documentS3Key(documentId);

  const additionalFactors: StoredFactor[] = [];
  if (Array.isArray(body.additionalFactors)) {
    for (const factor of body.additionalFactors) {
      const type = typeof factor?.type === 'string' ? factor.type.trim() : '';
      const value = typeof factor?.value === 'string' ? factor.value.trim() : '';
      if (!isRegisteredFactor(type) || value.length === 0) {
        return json(400, {
          message: `additionalFactors entries need a registered type (${type || 'missing'}) and a non-empty value.`,
        });
      }
      additionalFactors.push({ type, hash: hashFactor(type, value) });
    }
  }
  const verificationFactors = buildFactorList(
    { type: 'dob', hash: hashVerificationValue(verificationValue) },
    additionalFactors,
  );

  await s3client().send(
    new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      Body: pdf,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'aws:kms',
    }),
  );

  const item: DocumentItem = {
    documentId,
    customerId,
    recipientId,
    verificationValueHash: hashVerificationValue(verificationValue),
    expiryDate,
    originalFilename,
    documentReference,
    accessTokenHash: hashAccessToken(accessToken),
    s3Key,
    viewedStatus: false,
    createdAt,
    fallbackStatus: 'pending',
    ttl,
    sizeBytes: pdf.length,
    verificationFactors,
  };

  await db().send(
    new PutCommand({
      TableName: DOCUMENTS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(documentId)',
    }),
  );

  await db().send(
    new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        documentId,
        eventId: randomUUID(),
        timestamp: createdAt,
        customerId,
        type: 'upload',
        actor: supportActor(event),
        detail: documentReference,
      },
      ConditionExpression: 'attribute_not_exists(eventId)',
    }),
  );

  emitCountMetric('DocumentUploaded', { CustomerId: customerId });

  return json(201, {
    documentId,
    accessUrl: buildAccessUrl(ACCESS_URL_BASE || 'https://example.invalid', accessToken),
    expiryDate,
  });
}
