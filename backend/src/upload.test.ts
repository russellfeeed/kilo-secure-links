import assert from 'node:assert/strict';
import test from 'node:test';
import { validateUploadBody } from './upload.js';
import {
  buildAccessUrl,
  documentS3Key,
  hashAccessToken,
  hashVerificationValue,
  newAccessToken,
  verifyVerificationValue,
} from './documents.js';
import { isRegisteredTemplate, listTemplateIds } from './templates.js';

const FULL_BODY = {
  customerId: 'cust-1',
  recipientId: 'rec-1',
  verificationValue: '1990-01-31',
  expiryDate: new Date(Date.now() + 86400000).toISOString(),
  originalFilename: 'letter.pdf',
  documentReference: 'REF-1',
  pdfBase64: Buffer.from('%PDF-1.4 test').toString('base64'),
};

test('validateUploadBody accepts a complete body', () => {
  assert.deepEqual(validateUploadBody({ ...FULL_BODY }), { ok: true });
});

test('validateUploadBody reports every missing field', () => {
  const res = validateUploadBody({});
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.deepEqual(res.missing, [
    'customerId',
    'recipientId',
    'verificationValue',
    'expiryDate',
    'originalFilename',
    'documentReference',
    'pdfBase64',
  ]);
});

test('validateUploadBody rejects blank strings', () => {
  const res = validateUploadBody({ ...FULL_BODY, customerId: '   ' });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.deepEqual(res.missing, ['customerId']);
});

test('verification hashing round-trips and rejects wrong values', () => {
  const hash = hashVerificationValue('1990-01-31');
  assert.equal(verifyVerificationValue('1990-01-31', hash), true);
  assert.equal(verifyVerificationValue('1990-02-01', hash), false);
});

test('access tokens are unique and hash deterministically', () => {
  const a = newAccessToken();
  const b = newAccessToken();
  assert.notEqual(a, b);
  assert.equal(a.length, 22);
  assert.equal(hashAccessToken(a), hashAccessToken(a));
  assert.notEqual(hashAccessToken(a), hashAccessToken(b));
});

test('buildAccessUrl joins base and token with exactly one slash', () => {
  assert.equal(buildAccessUrl('https://x.example/', 'abc'), 'https://x.example/d/abc');
  assert.equal(buildAccessUrl('https://x.example', 'abc'), 'https://x.example/d/abc');
});

test('documentS3Key is namespaced per document', () => {
  assert.equal(documentS3Key('doc-1'), 'documents/doc-1.pdf');
});

test('REQ-024: template field is optional and never in the required list', () => {
  const res = validateUploadBody({ ...FULL_BODY });
  assert.deepEqual(res, { ok: true });
});

test('REQ-024: seeded template ids all pass registration', () => {
  // The upload handler rejects unregistered ids with 400 before anything else;
  // this asserts the registry the handler checks against contains the seeds.
  for (const id of ['default', 'restore-plc', 'york', 'nhs-radiology']) {
    assert.equal(isRegisteredTemplate(id), true);
    assert.ok(listTemplateIds().includes(id));
  }
});
