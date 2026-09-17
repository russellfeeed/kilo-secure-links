import assert from 'node:assert/strict';
import test from 'node:test';
import { lockoutUntilFrom } from './verify.js';

test('lockoutUntilFrom returns undefined below threshold', () => {
  const now = Date.parse('2026-09-17T12:00:00.000Z');
  assert.equal(lockoutUntilFrom(1, now), undefined);
  assert.equal(lockoutUntilFrom(4, now), undefined);
});

test('lockoutUntilFrom locks for 15 minutes at threshold', () => {
  const now = Date.parse('2026-09-17T12:00:00.000Z');
  assert.equal(lockoutUntilFrom(5, now), '2026-09-17T12:15:00.000Z');
  assert.equal(lockoutUntilFrom(9, now), '2026-09-17T12:15:00.000Z');
});
