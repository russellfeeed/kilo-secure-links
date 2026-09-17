import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { db, table } from '../db.js';
import { json, nowIso, supportActor } from '../http.js';

const AUDIT_TABLE = table(process.env.AUDIT_TABLE, 'securelinks-dev-audit-events');
const COUNTERS_TABLE = table(process.env.COUNTERS_TABLE, 'securelinks-dev-verification-counters');

interface ResetBody {
  documentId?: string;
  customerId?: string;
  reason?: string;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: ResetBody = {};
  try {
    body = event.body ? (JSON.parse(event.body) as ResetBody) : {};
  } catch {
    return json(400, { message: 'Request body must be valid JSON.' });
  }

  const documentId = body.documentId?.trim();
  const customerId = body.customerId?.trim();
  const reason = body.reason?.trim();

  if (!documentId || !customerId || !reason) {
    return json(400, {
      message: 'Fields documentId, customerId and reason are required.',
    });
  }

  const actor = supportActor(event);
  const timestamp = nowIso();

  await db().send(
    new UpdateCommand({
      TableName: COUNTERS_TABLE,
      Key: { documentId },
      UpdateExpression: 'SET failedCount = :zero REMOVE lockedUntil',
      ExpressionAttributeValues: { ':zero': 0 },
    }),
  );

  await db().send(
    new PutCommand({
      TableName: AUDIT_TABLE,
      Item: {
        documentId,
        eventId: randomUUID(),
        timestamp,
        customerId,
        type: 'lockout_reset',
        actor,
        detail: reason,
      },
      ConditionExpression: 'attribute_not_exists(eventId)',
    }),
  );

  return json(200, {
    documentId,
    customerId,
    reset: true,
    resetAt: timestamp,
    actor,
  });
}
