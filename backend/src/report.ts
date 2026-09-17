import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { db, table } from './db.js';
import { json, supportActor } from './http.js';
import type { AuditEvent, AuditEventType } from './model.js';

const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');
const AUDIT_TABLE = table(process.env.AUDIT_TABLE, 'securelinks-dev-audit-events');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export function parseReportParams(params: Record<string, string | undefined>): {
  ok: true;
  customerId: string;
  from?: string;
  to?: string;
  limit: number;
  nextToken?: string;
} | { ok: false; message: string } {
  const customerId = params.customerId?.trim();
  if (!customerId) {
    return { ok: false, message: 'Query parameter customerId is required.' };
  }
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;
  if (from !== undefined && Number.isNaN(Date.parse(from))) {
    return { ok: false, message: 'Query parameter from must be a valid date-time.' };
  }
  if (to !== undefined && Number.isNaN(Date.parse(to))) {
    return { ok: false, message: 'Query parameter to must be a valid date-time.' };
  }
  if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
    return { ok: false, message: 'Query parameter from must not be after to.' };
  }
  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined && params.limit.trim() !== '') {
    const parsed = Number(params.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return { ok: false, message: `Query parameter limit must be an integer 1-${MAX_LIMIT}.` };
    }
    limit = parsed;
  }
  const nextToken = params.nextToken?.trim() || undefined;
  if (nextToken !== undefined) {
    try {
      const decoded = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8')) as {
        documentId?: string;
        eventId?: string;
      };
      if (typeof decoded.documentId !== 'string' || typeof decoded.eventId !== 'string') {
        return { ok: false, message: 'Query parameter nextToken is invalid.' };
      }
    } catch {
      return { ok: false, message: 'Query parameter nextToken is invalid.' };
    }
  }
  return { ok: true, customerId, from, to, limit, nextToken };
}

export function encodeNextToken(key: { documentId: string; eventId: string }): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

interface ReportEvent {
  documentId: string;
  eventId: string;
  timestamp: string;
  type: string;
  actor: string;
  documentReference?: string;
  detail?: string;
}

export function toReportEvent(item: AuditEvent, docRefById: Map<string, string>): ReportEvent {
  const ev: ReportEvent = {
    documentId: String(item.documentId ?? ''),
    eventId: String(item.eventId ?? ''),
    timestamp: String(item.timestamp ?? ''),
    type: String(item.type ?? 'unknown') as AuditEventType,
    actor: String(item.actor ?? ''),
  };
  const ref = docRefById.get(ev.documentId);
  if (ref !== undefined) ev.documentReference = ref;
  if (typeof item.detail === 'string') ev.detail = item.detail;
  return ev;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const parsed = parseReportParams(event.queryStringParameters ?? {});
  if (!parsed.ok) {
    return json(400, { message: parsed.message });
  }

  let keyCond = 'customerId = :c';
  const values: Record<string, string> = { ':c': parsed.customerId };
  if (parsed.from !== undefined && parsed.to !== undefined) {
    keyCond += ' AND #ts BETWEEN :from AND :to';
    values[':from'] = parsed.from;
    values[':to'] = parsed.to;
  } else if (parsed.from !== undefined) {
    keyCond += ' AND #ts >= :from';
    values[':from'] = parsed.from;
  } else if (parsed.to !== undefined) {
    keyCond += ' AND #ts <= :to';
    values[':to'] = parsed.to;
  }

  const res = await db().send(
    new QueryCommand({
      TableName: AUDIT_TABLE,
      IndexName: 'byCustomerTime',
      KeyConditionExpression: keyCond,
      ExpressionAttributeNames: keyCond.includes('#ts') ? { '#ts': 'timestamp' } : undefined,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: parsed.limit,
      ExclusiveStartKey: parsed.nextToken
        ? (JSON.parse(Buffer.from(parsed.nextToken, 'base64url').toString('utf8')) as {
            documentId: string;
            eventId: string;
          })
        : undefined,
    }),
  );

  const items = (res.Items ?? []) as AuditEvent[];
  const docIds = [...new Set(items.map((i) => String(i.documentId ?? '')).filter((d) => d.length > 0))];
  const docRefById = new Map<string, string>();
  await Promise.all(
    docIds.map(async (documentId) => {
      const doc = await db().send(
        new QueryCommand({
          TableName: DOCUMENTS_TABLE,
          KeyConditionExpression: 'documentId = :d',
          ExpressionAttributeValues: { ':d': documentId },
          ProjectionExpression: 'documentId, customerId, documentReference',
          Limit: 1,
        }),
      );
      const row = doc.Items?.[0] as { customerId?: string; documentReference?: string } | undefined;
      if (row?.customerId === parsed.customerId && typeof row.documentReference === 'string') {
        docRefById.set(documentId, row.documentReference);
      }
    }),
  );

  const events = items
    .filter((i) => String(i.customerId ?? '') === parsed.customerId)
    .map((i) => toReportEvent(i, docRefById));

  const response: {
    customerId: string;
    events: ReportEvent[];
    generatedBy: string;
    nextToken?: string;
  } = {
    customerId: parsed.customerId,
    events,
    generatedBy: supportActor(event),
  };
  if (res.LastEvaluatedKey) {
    const lek = res.LastEvaluatedKey as { documentId?: string; eventId?: string };
    if (typeof lek.documentId === 'string' && typeof lek.eventId === 'string') {
      response.nextToken = encodeNextToken({ documentId: lek.documentId, eventId: lek.eventId });
    }
  }

  return json(200, response);
}
