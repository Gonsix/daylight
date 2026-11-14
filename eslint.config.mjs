import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', 'main.js', 'build.mjs', 'docs/**', 'scripts/**', 'eslint.config.mjs', 'tests/**']),
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: true } } },
]);
