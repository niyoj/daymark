# Contributing to Daymark Habits

Use Node.js **22.18+ or 24+** and npm. The plugin runtime has no third-party dependencies; the packages installed below are development tools.

```sh
git clone https://github.com/niyoj/daymark.git
cd daymark
npm ci
npm run check
```

`npm run check` runs the official Obsidian ESLint rules, strict TypeScript, the production build, automated tests against the source and bundle, and release metadata/link checks. `npm run dev` watches source files. `npm run package` builds `dist/niyoj-daymark-0.2.2.zip` with the three installation assets.

For manual testing, use a disposable vault and copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/niyoj-daymark/`. Enable Daymark Habits, create a routine, and try the four Markdown views in Reading view and Live Preview. Avoid developing against your only copy of real habit records.

The live UI scripts require macOS, an Obsidian instance using `/private/tmp/daymark-runtime-vault`, and debugging port `9231`. They guard the vault path and restore test records. `npm run test:export-ui` checks real JSON export; `npm run test:board-stats-ui` checks lifetime stats and the responsive Habit Board. `npm run test:ui` checks light/dark desktop and phone-width layouts, keyboard interaction, correction, and freeze controls. These scripts do not start Obsidian themselves.

`node --experimental-strip-types scripts/obsidian-smoke.mjs` creates a local demo vault with fictional records. It intentionally rewrites `test-vault`, which is ignored by Git; use it only to create/reset disposable demo data. The original development workspace’s existing test vault is not part of this repository.

Use Obsidian’s public APIs and theme variables. Keep domain calculations independent of the UI, preserve dated records when editing routines, and test schedule/freeze changes. The default empty Markdown block is Habit Board. Keep the documented default and explicit view options covered by parser and integration tests.

The `minimatch` override pins affected lint-tool dependencies to the patched 11.x API. `npm audit` and the official lint rules are checked when updating development dependencies.

Gallery captures use `npm run screenshots:capture` in the isolated runtime; `npm run screenshots:check` verifies dimensions and file limits, and `npm run screenshots:package` makes an upload ZIP. See the [gallery guide](docs/images/gallery/README.md).

For a release, follow [RELEASING.md](docs/RELEASING.md). Contributions are provided under the repository’s [0BSD license](LICENSE).
