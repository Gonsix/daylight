import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t: { after: (callback: () => void) => void }) {
  const root = mkdtempSync(path.join(tmpdir(), 'daylight-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'development checkout'), vault = path.join(root, 'My Vault');
  const bin = path.join(root, 'bin'), destination = path.join(vault, '.obsidian/plugins/daylight');
  for (const dir of [repo, bin, destination]) mkdirSync(dir, { recursive: true });
  copyFileSync('install.sh', path.join(repo, 'install.sh'));
  writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> npm-calls
if [[ "$1" == ci ]]; then mkdir node_modules; exit 0; fi
if [[ "\u0024{FAIL_BUILD:-}" == 1 ]]; then exit 42; fi
printf 'built JavaScript' > main.js
`);
  chmodSync(path.join(bin, 'npm'), 0o755);
  writeFileSync(path.join(repo, 'manifest.json'), '{"id":"daylight"}');
  writeFileSync(path.join(repo, 'styles.css'), '/* styles */');
  const run = (args: string[], env: Record<string, string> = {}) => spawnSync('bash', [path.join(repo, 'install.sh'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, DAYLIGHT_VAULT_PATH: '', PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...env },
  });
  return { repo, vault, destination, run };
}

test('external checkout installs only artifacts, preserves settings, and accepts relative paths with spaces', t => {
  const { repo, destination, run } = fixture(t);
  writeFileSync(path.join(destination, 'data.json'), '{"rootFolder":"custom/Daylight"}');
  assert.equal(run(['My Vault']).status, 0);
  assert.equal(readFileSync(path.join(destination, 'main.js'), 'utf8'), 'built JavaScript');
  assert.equal(readFileSync(path.join(destination, 'data.json'), 'utf8'), '{"rootFolder":"custom/Daylight"}');
  assert.deepEqual(readdirSync(destination).sort(), ['data.json', 'main.js', 'manifest.json', 'styles.css']);
  assert.equal(readFileSync(path.join(repo, 'npm-calls'), 'utf8'), 'ci --include=dev\nrun build\n');
});

test('build failure leaves installed artifacts untouched and repeat installs use existing dependencies', t => {
  const { repo, vault, destination, run } = fixture(t);
  mkdirSync(path.join(repo, 'node_modules'));
  writeFileSync(path.join(destination, 'main.js'), 'old build');
  assert.equal(run([], { DAYLIGHT_VAULT_PATH: vault, FAIL_BUILD: '1' }).status, 42);
  assert.equal(readFileSync(path.join(destination, 'main.js'), 'utf8'), 'old build');
  assert.equal(readFileSync(path.join(repo, 'npm-calls'), 'utf8'), 'run build\n');
});

test('invalid vault is rejected before installing dependencies or creating folders', t => {
  const { run, destination } = fixture(t);
  const result = run(['missing vault']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /existing vault/);
  assert.deepEqual(readdirSync(destination), []);
});
