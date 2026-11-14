import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', 'main.js', 'esbuild.config.mjs', 'scripts/**', 'tests/**', 'companion/**', 'test-vault/**', '.agents/**', '.claude/**', '.codex/**', '.impeccable/**', '.prototype-backups/**']),
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ['eslint.config.mjs'] } } } },
]);
