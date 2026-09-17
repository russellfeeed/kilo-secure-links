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
  failedCount: number;
  locked: boolean;
  lockedUntil?: string;
  recentAudit: Array<{ type: string; timestamp: string; actor: string; detail?: string }>;
  note: string;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const documentId = event.queryStringParameters?.documentId?.trim();
  const customerId = event.queryStringParameters?.customerId?.trim();

  if (!documentId || !customerId) {
    return json(400, {
      message: 'Query parameters documentId and customerId are required.',
    });
  }

  const doc = await db().send(
    new GetCommand({
      TableName: DOCUMENTS_TABLE,
      Key: { documentId },
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
        Key: { documentId },
      }),
    ),
    db().send(
      new QueryCommand({
        TableName: AUDIT_TABLE,
        KeyConditionExpression: 'documentId = :d',
        ExpressionAttributeValues: { ':d': documentId },
        ScanIndexForward: false,
        Limit: 20,
      }),
    ),
  ]);

  const counter = (counterRes.Item ?? { failedCount: 0 }) as VerificationCounter;
  const locked =
    typeof counter.lockedUntil === 'string' && counter.lockedUntil.length > 0
      ? Date.parse(counter.lockedUntil) > Date.now()
      : false;

  const response: SupportHealthResponse = {
    documentId,
    customerId,
    documentReference: String(doc.Item.documentReference ?? ''),
    viewedStatus: Boolean(doc.Item.viewedStatus ?? false),
    failedCount: Number(counter.failedCount ?? 0),
    locked,
    lockedUntil: counter.lockedUntil,
    recentAudit: ((auditRes.Items ?? []) as AuditEvent[]).map((item) => ({
      type: String(item.type ?? 'unknown'),
      timestamp: String(item.timestamp ?? ''),
      actor: String(item.actor ?? ''),
      detail: typeof item.detail === 'string' ? item.detail : undefined,
    })),
    note: 'SMS dispatch is owned upstream by Prism/Firetext; queue state here mirrors Prism-reported delivery state in audit records.',
  };

  return json(200, response);
}
