import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  buildFactorList,
  candidateFor,
  hashFactor,
  isRegisteredFactor,
  listFactorTypes,
  verifyFactor,
} from './factors.js';
import { aggregateUsage } from './usage.js';

test('registered factors include dob, postcode, accountNumber and otp', () => {
  const types = listFactorTypes();
  for (const expected of ['accountNumber', 'dob', 'otp', 'postcode']) {
    assert.equal(types.includes(expected), true);
    assert.equal(isRegisteredFactor(expected), true);
  }
  assert.equal(isRegisteredFactor('nonsense'), false);
});

test('dob factor keeps the legacy salt so existing hashes verify', () => {
  // Legacy format: sha256('securelinks:v1:dob:' + value) — pre-REQ-018 rows must still verify.
  const legacyHash = createHash('sha256').update('securelinks:v1:dob:1990-01-31').digest('hex');
  assert.equal(hashFactor('dob', '1990-01-31'), legacyHash);
  assert.equal(verifyFactor('dob', '1990-01-31', legacyHash), true);
  assert.equal(verifyFactor('dob', '1990-02-01', legacyHash), false);
  assert.equal(verifyFactor('postcode', '1990-01-31', legacyHash), false);
});

test('unknown factor types cannot hash or verify', () => {
  assert.throws(() => hashFactor('nonsense', 'x'));
  assert.equal(verifyFactor('nonsense', 'x', 'ff'), false);
});

test('buildFactorList places dob first, drops unknown and duplicates', () => {
  const out = buildFactorList(
    { type: 'dob', hash: 'aa' },
    [
      { type: 'postcode', hash: 'bb' },
      { type: 'dob', hash: 'cc' },
      { type: 'nonsense', hash: 'dd' },
      { type: 'otp', hash: 'ee' },
    ],
  );
  assert.deepEqual(out, [
    { type: 'dob', hash: 'aa' },
    { type: 'postcode', hash: 'bb' },
    { type: 'otp', hash: 'ee' },
  ]);
});

test('buildFactorList works without additional factors', () => {
  assert.deepEqual(buildFactorList({ type: 'dob', hash: 'aa' }, undefined), [{ type: 'dob', hash: 'aa' }]);
});

test('candidateFor reads dob from field and others from factorValues', () => {
  const body = { dateOfBirth: ' 1990-01-31 ', factorValues: { postcode: ' SW1A 1AA ' } };
  assert.equal(candidateFor('dob', body), '1990-01-31');
  assert.equal(candidateFor('postcode', body), 'SW1A 1AA');
  assert.equal(candidateFor('otp', body), undefined);
});

test('aggregateUsage sums volume, views, storage, fallback for one customer', () => {
  const rows = [
    { customerId: 'a', createdAt: '2026-09-01T00:00:00.000Z', viewedStatus: true, sizeBytes: 100, fallbackStatus: 'pending' },
    { customerId: 'a', createdAt: '2026-09-03T00:00:00.000Z', viewedStatus: false, sizeBytes: 250, fallbackStatus: 'notified' },
    { customerId: 'b', createdAt: '2026-09-05T00:00:00.000Z', viewedStatus: true, sizeBytes: 9999 },
    { customerId: 'a', viewedStatus: true, sizeBytes: 50 },
  ];
  const summary = aggregateUsage(rows as Array<Record<string, unknown>>, 'a');
  assert.equal(summary.customerId, 'a');
  assert.equal(summary.documentsUploaded, 3);
  assert.equal(summary.documentsViewed, 2);
  assert.equal(summary.storageBytes, 400);
  assert.equal(summary.fallbackNotified, 1);
  assert.equal(summary.firstUploadAt, '2026-09-01T00:00:00.000Z');
  assert.equal(summary.lastUploadAt, '2026-09-03T00:00:00.000Z');
  assert.equal(summary.scanned, 4);
});

test('aggregateUsage handles empty input', () => {
  const summary = aggregateUsage([], 'a');
  assert.equal(summary.documentsUploaded, 0);
  assert.equal(summary.documentsViewed, 0);
  assert.equal(summary.storageBytes, 0);
  assert.equal(summary.firstUploadAt, undefined);
  assert.equal(summary.truncated, false);
});
