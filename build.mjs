import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
const result = await build({
  entryPoints: ['src/main.tsx'], outfile: 'main.js', bundle: true,
  loader: { '.md': 'text' }, platform: 'browser', format: 'cjs', target: 'es2022', external: ['obsidian'],
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true, metafile: true,
  banner: { js: `/* Daylight — built from src/main.tsx.\n\n${notices}\n*/` },
});
await mkdir('dist', { recursive: true });
await writeFile('dist/build-meta.json', JSON.stringify(result.metafile, null, 2) + '\n');
