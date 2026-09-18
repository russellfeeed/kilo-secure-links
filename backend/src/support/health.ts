import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { db, table } from '../db.js';
import { json } from '../http.js';
import type { AuditEvent, VerificationCounter } from '../model.js';

const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');
const AUDIT_TABLE = table(process.env.AUDIT_TABLE, 'securelinks-dev-audit-events');
const COUNTERS_TABLE = table(process.env.COUNTERS_TABLE, 'securelinks-dev-verification-counters');

interface SupportHealthResponse {
  documentId: string;
  customerId: string;
  documentReference: string;
  viewedStatus: boolean;
  /** Consecutive failures since the last success (drives the lockout). */
  failedCount: number;
  /** Lifetime failures — never reset (REQ-015-era addition for support reporting). */
  lifetimeFailures: number;
  locked: boolean;
  lockedUntil?: string;
  recentAudit: Array<{ type: string; timestamp: string; actor: string; detail?: string }>;
  note: string;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const documentId = event.queryStringParameters?.documentId?.trim();
  const reference = event.queryStringParameters?.reference?.trim();
  const customerId = event.queryStringParameters?.customerId?.trim();

  if (!customerId || (!documentId && !reference)) {
    return json(400, {
      message: 'Query parameters customerId and (documentId or reference) are required.',
    });
  }

  let docId: string;
  if (documentId) {
    docId = documentId;
  } else {
    // Lookup by human-readable reference (REQ-009 tenant scoping: the GSI
    // pairs reference with customerId, so both must match).
    const byRef = await db().send(
      new QueryCommand({
        TableName: DOCUMENTS_TABLE,
        IndexName: 'byReference',
        KeyConditionExpression: 'documentReference = :r AND customerId = :c',
        ExpressionAttributeValues: { ':r': reference as string, ':c': customerId },
        ProjectionExpression: 'documentId',
        Limit: 1,
      }),
    );
    const match = byRef.Items?.[0] as { documentId?: string } | undefined;
    if (!match?.documentId) {
      return json(404, { message: 'Document not found for this customer.' });
    }
    docId = match.documentId;
  }

  const doc = await db().send(
    new GetCommand({
      TableName: DOCUMENTS_TABLE,
      Key: { documentId: docId },
      ProjectionExpression: 'documentId, customerId, documentReference, viewedStatus, fallbackStatus, fallbackTriggeredAt',
    }),
  );

  if (!doc.Item || doc.Item.customerId !== customerId) {
    return json(404, { message: 'Document not found for this customer.' });
  }

  const [counterRes, auditRes] = await Promise.all([
    db().send(
      new GetCommand({
        TableName: COUNTERS_TABLE,
        Key: { documentId: docId },
      }),
    ),
    db().send(
      new QueryCommand({
        TableName: AUDIT_TABLE,
        KeyConditionExpression: 'documentId = :d',
        ExpressionAttributeValues: { ':d': docId },
        // SK is a random eventId, so fetch a wider window and sort by
        // timestamp in memory (newest first).
        Limit: 100,
      }),
    ),
  ]);

  const counter = (counterRes.Item ?? { failedCount: 0 }) as VerificationCounter;
  const locked =
    typeof counter.lockedUntil === 'string' && counter.lockedUntil.length > 0
      ? Date.parse(counter.lockedUntil) > Date.now()
      : false;

  const response: SupportHealthResponse = {
    documentId: docId,
    customerId,
    documentReference: String(doc.Item.documentReference ?? ''),
    viewedStatus: Boolean(doc.Item.viewedStatus ?? false),
    failedCount: Number(counter.failedCount ?? 0),
    lifetimeFailures: Number(counter.totalFailed ?? 0),
    locked,
    lockedUntil: counter.lockedUntil,
    recentAudit: ((auditRes.Items ?? []) as AuditEvent[])
      .map((item) => ({
        type: String(item.type ?? 'unknown'),
        timestamp: String(item.timestamp ?? ''),
        actor: String(item.actor ?? ''),
        detail: typeof item.detail === 'string' ? item.detail : undefined,
      }))
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
      .slice(0, 20),
    note: 'SMS dispatch is owned upstream by Prism/Firetext; queue state here mirrors Prism-reported delivery state in audit records.',
  };

  return json(200, response);
}
