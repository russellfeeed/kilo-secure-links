import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cached: DynamoDBDocumentClient | null = null;

export function db(): DynamoDBDocumentClient {
  if (!cached) {
    const client = new DynamoDBClient({});
    cached = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cached;
}

export function table(name: string | undefined, fallback: string): string {
  return name && name.length > 0 ? name : fallback;
}
