import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { db, table } from './db.js';
import { hashAccessToken } from './documents.js';
import { json } from './http.js';
import { resolveTemplate } from './templates.js';
import type { DocumentItem } from './model.js';

const DOCUMENTS_TABLE = table(process.env.DOCUMENTS_TABLE, 'securelinks-dev-documents');

/**
 * REQ-024: resolve the branding template for a link so the patient page can
 * style itself before verification. The capability token is the credential;
 * the response carries only the template id and label — no PHI.
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const token = event.queryStringParameters?.token?.trim();
  if (!token) {
    return json(400, { message: 'Query parameter token is required.' });
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
        ProjectionExpression: 'documentId',
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
        ProjectionExpression: 'documentId',
        Limit: 1,
      }),
    );
  }

  const docId = (lookup.Items?.[0] as { documentId?: string } | undefined)?.documentId;
  if (!docId) {
    return json(404, { message: 'This link is invalid or has expired.' });
  }
  const full = await db().send(new GetCommand({ TableName: DOCUMENTS_TABLE, Key: { documentId: docId } }));
  const doc = (full.Item ?? null) as unknown as Partial<DocumentItem> | null;
  if (!doc || typeof doc.template !== 'string' || doc.template.length === 0) {
    // Legacy documents without a template keep the default look and feel.
    const fallback = resolveTemplate(undefined);
    return json(200, { template: fallback.id, label: fallback.label });
  }
  const resolved = resolveTemplate(doc.template);
  return json(200, { template: resolved.id, label: resolved.label });
}
