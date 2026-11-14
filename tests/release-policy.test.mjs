import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewReleasePolicy } from '../scripts/release-policy.mjs';

test('release policy rejects literal script creation including the former renderer resource loader', () => {
  for (const code of [
    'ownerDocument.createElement("script")',
    "document['createElement']('SCRIPT')",
    "document.createElementNS('http://www.w3.org/1999/xhtml', 'script')",
    'document.head.insertAdjacentHTML("beforeend", "<script src=bad></script>")',
    'node.innerHTML = "<script></script>"',
  ]) assert.ok(reviewReleasePolicy(code, '').some(reason => reason.includes('script')), code);
  assert.deepEqual(reviewReleasePolicy('document.createElement("button"); document.createElement(tag)', ''), []);
});

test('release policy rejects dynamic evaluation and flagged CSS without matching comments', () => {
  assert.ok(reviewReleasePolicy('eval(source)', '').length);
  assert.ok(reviewReleasePolicy('new Function(source)', '').length);
  assert.ok(reviewReleasePolicy('', '.x { padding: 0 !important; }').length);
  assert.ok(reviewReleasePolicy('', '.x { clip-path: inset(50%); }').length);
  assert.deepEqual(reviewReleasePolicy('// createElement("script")', '/* !important */ .x { overflow: hidden; left: -10000px; }'), []);
});
