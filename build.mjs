import { build } from 'esbuild';
await build({ entryPoints: ['src/main.tsx'], outfile: 'main.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', external: ['obsidian'],
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true,
  banner: { js: '/* Daylight — built from src/main.tsx. */' } });
