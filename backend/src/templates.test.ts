import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEMPLATE_ID,
  isRegisteredTemplate,
  listTemplateIds,
  resolveTemplate,
} from './templates.js';

test('default template is registered and first in sorted ids', () => {
  assert.equal(isRegisteredTemplate(DEFAULT_TEMPLATE_ID), true);
  assert.equal(listTemplateIds()[0], DEFAULT_TEMPLATE_ID);
});

test('seeded templates from REQ-024 are registered', () => {
  for (const id of ['default', 'nhs-radiology', 'restore-plc', 'york']) {
    assert.equal(isRegisteredTemplate(id), true);
  }
});

test('every registered id resolves to itself with a non-empty label', () => {
  for (const id of listTemplateIds()) {
    const resolved = resolveTemplate(id);
    assert.equal(resolved.id, id);
    assert.ok(resolved.label.length > 0);
  }
});

test('blank and undefined ids resolve to the default template', () => {
  for (const id of [undefined, '', '   ']) {
    assert.equal(resolveTemplate(id).id, DEFAULT_TEMPLATE_ID);
  }
});

test('unknown ids resolve to the default template', () => {
  assert.equal(resolveTemplate('bogus-brand').id, DEFAULT_TEMPLATE_ID);
  assert.equal(isRegisteredTemplate('bogus-brand'), false);
});
