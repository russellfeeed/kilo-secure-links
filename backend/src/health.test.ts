import assert from 'node:assert/strict';
import test from 'node:test';
import { handler as healthHandler } from './health.js';

test('GET /health returns foundation ok payload', async () => {
  const res = (await healthHandler({} as never)) as { statusCode: number; body: string };
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /securelinks/);
});
