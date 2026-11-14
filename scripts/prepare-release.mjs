import { reviewReleasePolicy } from './release-policy.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const json = async name => JSON.parse(await readFile(name, 'utf8'));
const [manifest, pkg, lock, versions, metadata] = await Promise.all([
  'manifest.json', 'package.json', 'package-lock.json', 'versions.json', 'dist/build-meta.json',
].map(json));
const version = manifest.version;
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, version);
assert.equal(lock.version, version);
assert.equal(lock.packages[''].version, version);
assert.equal(versions[version], manifest.minAppVersion);
assert.equal(manifest.id, 'daylight');
assert.equal(manifest.name, 'Daylight');
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(manifest.isDesktopOnly, false);
assert.ok((await readFile('CHANGELOG.md', 'utf8')).includes(`## ${version}`));
for (const output of Object.values(metadata.outputs)) {
  for (const entry of output.imports) {
    if (entry.external) assert.equal(entry.path, 'obsidian', 'Unexpected external runtime dependency');
  }
}
const bundled = new Set(Object.keys(metadata.inputs).flatMap(input => {
  const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  return match ? [match[1]] : [];
}));
assert.deepEqual([...bundled].sort(), ['preact']);
const bundle = await readFile('main.js', 'utf8');
for (const name of bundled) {
  const license = (await readFile(`node_modules/${name}/LICENSE`, 'utf8')).trim();
  assert.ok(bundle.includes(license), `Missing bundled license for ${name}`);
}
assert.ok(bundle.includes('daylight-sunrise'));
assert.deepEqual(reviewReleasePolicy(bundle, await readFile('styles.css', 'utf8')), [], 'Release policy violations');
assert.ok((await readFile(`docs/releases/${version}.md`, 'utf8')).trim());
const output = path.join('dist', version);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
let sums = '';
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const bytes = await readFile(name);
  assert.ok(bytes.length > 0, `Empty release asset: ${name}`);
  await copyFile(name, path.join(output, name));
  sums += `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`;
}
// Checksums stay local; Obsidian release assets contain only supported files.
await writeFile('dist/SHA256SUMS', sums);
console.log(`Validated release ${version}; supported assets: ${output}; local checksums: dist/SHA256SUMS`);
