import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeNextToken, parseReportParams, toReportEvent } from './report.js';

test('parseReportParams accepts customerId alone with defaults', () => {
  const res = parseReportParams({ customerId: 'cust-1' });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.customerId, 'cust-1');
  assert.equal(res.limit, 50);
  assert.equal(res.from, undefined);
  assert.equal(res.to, undefined);
  assert.equal(res.nextToken, undefined);
});

test('parseReportParams requires customerId', () => {
  const res = parseReportParams({});
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.message, /customerId/);
});

test('parseReportParams validates from/to dates and order', () => {
  assert.equal(parseReportParams({ customerId: 'c', from: 'nope' }).ok, false);
  assert.equal(parseReportParams({ customerId: 'c', to: 'nope' }).ok, false);
  assert.equal(
    parseReportParams({ customerId: 'c', from: '2026-09-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }).ok,
    false,
  );
  const ok = parseReportParams({
    customerId: 'c',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-02T00:00:00.000Z',
  });
  assert.equal(ok.ok, true);
});

test('parseReportParams validates limit bounds', () => {
  assert.equal(parseReportParams({ customerId: 'c', limit: '0' }).ok, false);
  assert.equal(parseReportParams({ customerId: 'c', limit: '101' }).ok, false);
  assert.equal(parseReportParams({ customerId: 'c', limit: '2.5' }).ok, false);
  const ok = parseReportParams({ customerId: 'c', limit: '10' });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.limit, 10);
});

test('parseReportParams validates nextToken shape', () => {
  assert.equal(parseReportParams({ customerId: 'c', nextToken: '!!!' }).ok, false);
  const valid = encodeNextToken({ documentId: 'd', eventId: 'e' });
  const ok = parseReportParams({ customerId: 'c', nextToken: valid });
  assert.equal(ok.ok, true);
});

test('toReportEvent maps fields and joins document reference', () => {
  const refs = new Map([['doc-1', 'REF-1']]);
  const ev = toReportEvent(
    {
      documentId: 'doc-1',
      eventId: 'ev-1',
      timestamp: '2026-09-17T00:00:00.000Z',
      customerId: 'cust-1',
      type: 'success',
      actor: 'recipient:anonymous',
      detail: 'x',
    },
    refs,
  );
  assert.deepEqual(ev, {
    documentId: 'doc-1',
    eventId: 'ev-1',
    timestamp: '2026-09-17T00:00:00.000Z',
    type: 'success',
    actor: 'recipient:anonymous',
    documentReference: 'REF-1',
    detail: 'x',
  });
});

test('toReportEvent omits reference and detail when absent', () => {
  const ev = toReportEvent(
    {
      documentId: 'doc-9',
      eventId: 'ev-9',
      timestamp: '2026-09-17T00:00:00.000Z',
      customerId: 'cust-1',
      type: 'upload',
      actor: 'support:x',
    },
    new Map(),
  );
  assert.deepEqual(ev, {
    documentId: 'doc-9',
    eventId: 'ev-9',
    timestamp: '2026-09-17T00:00:00.000Z',
    type: 'upload',
    actor: 'support:x',
  });
});
