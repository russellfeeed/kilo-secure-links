import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function supportActor(event: APIGatewayProxyEventV2): string {
  const ctx = event.requestContext as unknown as {
    authorizer?: { iam?: { userArn?: string; userId?: string } };
  };
  return (
    ctx.authorizer?.iam?.userArn ??
    ctx.authorizer?.iam?.userId ??
    'support:unknown'
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}
