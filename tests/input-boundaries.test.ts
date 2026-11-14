import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTitle, renderCreatedNote } from '../src/create';
import { eventDocument } from '../src/event';
import { taskDocument } from '../src/task';


test('non-mapping YAML roots are rejected before editing notes or expanding templates', () => {
  for (const value of [null, [], 42, 'text', new Date('2026-11-14T00:00:00Z')]) {
    const yaml = { parse: () => value, stringify: () => '' };
    const note = '---\ninvalid: root\n---\nKeep this body';
    assert.throws(() => eventDocument(note, yaml));
    assert.throws(() => taskDocument(note, yaml));
    assert.throws(() => renderCreatedNote(note, 'task', {}, '', '2026-11-14', yaml));
  }
});

test('note titles reject control characters and filename delimiters', () => {
  for (let code = 0; code < 32; code++) assert.throws(() => validateTitle(`A${String.fromCharCode(code)}B`));
  for (const symbol of ['[', ']', '/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '^']) {
    assert.throws(() => validateTitle(`A${symbol}B`));
  }
  assert.equal(validateTitle(' 日の出 — Morning plan '), '日の出 — Morning plan');
});
