import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { db, table } from './db.js';
import { json, supportActor } from './http.js';

const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');

const MAX_PAGES = 20;
const PAGE_SIZE = 200;

export interface UsageRow {
  createdAt?: unknown;
  viewedStatus?: unknown;
  sizeBytes?: unknown;
  fallbackStatus?: unknown;
}

export interface UsageSummary {
  customerId: string;
  documentsUploaded: number;
  documentsViewed: number;
  storageBytes: number;
  fallbackNotified: number;
  firstUploadAt?: string;
  lastUploadAt?: string;
  scanned: number;
  truncated: boolean;
  generatedBy: string;
}

/**
 * REQ-015: aggregate commercial usage for one customer from the byCustomer GSI.
 * Pure function — unit-tested without AWS.
 */
export function aggregateUsage(items: Array<Record<string, unknown>>, customerId: string): UsageSummary {
  let uploaded = 0;
  let viewed = 0;
  let storage = 0;
  let fallback = 0;
  let first: string | undefined;
  let last: string | undefined;

  for (const item of items) {
    if (String(item.customerId ?? '') !== customerId) continue;
    uploaded += 1;
    if (item.viewedStatus === true) viewed += 1;
    if (typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes)) {
      storage += item.sizeBytes;
    }
    if (item.fallbackStatus === 'notified') fallback += 1;
    if (typeof item.createdAt === 'string' && item.createdAt.length > 0) {
      if (first === undefined || item.createdAt < first) first = item.createdAt;
      if (last === undefined || item.createdAt > last) last = item.createdAt;
    }
  }

  return {
    customerId,
    documentsUploaded: uploaded,
    documentsViewed: viewed,
    storageBytes: storage,
    fallbackNotified: fallback,
    firstUploadAt: first,
    lastUploadAt: last,
    scanned: items.length,
    truncated: false,
    generatedBy: 'system',
  };
}

function decodeNextToken(token: string): { customerId: string; createdAt: string; documentId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      customerId?: unknown;
      createdAt?: unknown;
      documentId?: unknown;
    };
    if (
      typeof decoded.customerId === 'string' &&
      typeof decoded.createdAt === 'string' &&
      typeof decoded.documentId === 'string'
    ) {
      return { customerId: decoded.customerId, createdAt: decoded.createdAt, documentId: decoded.documentId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const customerId = event.queryStringParameters?.customerId?.trim();
  if (!customerId) {
    return json(400, { message: 'Query parameter customerId is required.' });
  }

  let exclusiveStart: { customerId: string; createdAt: string; documentId: string } | undefined;
  const nextToken = event.queryStringParameters?.nextToken?.trim();
  if (nextToken) {
    const decoded = decodeNextToken(nextToken);
    if (!decoded || decoded.customerId !== customerId) {
      return json(400, { message: 'Query parameter nextToken is invalid.' });
    }
    exclusiveStart = decoded;
  }

  let items: Array<Record<string, unknown>> = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let truncated = false;
  let pages = 0;

  do {
    const res = await db().send(
      new QueryCommand({
        TableName: DOCUMENTS_TABLE,
        IndexName: 'byCustomer',
        KeyConditionExpression: 'customerId = :c',
        ExpressionAttributeValues: { ':c': customerId },
        ProjectionExpression: 'customerId, createdAt, viewedStatus, sizeBytes, fallbackStatus',
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: PAGE_SIZE,
      }),
    );
    items = items.concat((res.Items ?? []) as Array<Record<string, unknown>>);
    lastEvaluatedKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    pages += 1;
  } while (lastEvaluatedKey && pages < MAX_PAGES);

  if (lastEvaluatedKey) {
    truncated = true;
  }

  const summary = aggregateUsage(items, customerId);
  summary.truncated = truncated;
  summary.generatedBy = supportActor(event);

  const response: UsageSummary & { nextToken?: string } = { ...summary };
  if (truncated && lastEvaluatedKey) {
    const lek = lastEvaluatedKey as { customerId?: string; createdAt?: string; documentId?: string };
    if (
      typeof lek.customerId === 'string' &&
      typeof lek.createdAt === 'string' &&
      typeof lek.documentId === 'string'
    ) {
      response.nextToken = Buffer.from(
        JSON.stringify({ customerId: lek.customerId, createdAt: lek.createdAt, documentId: lek.documentId }),
        'utf8',
      ).toString('base64url');
    }
  }

  return json(200, response);
}
