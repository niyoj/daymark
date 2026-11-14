# Release and Community directory submission

Repository: **https://github.com/niyoj/daymark**. Author: **niyoj**. Display name: **Daymark Habits**. Stable plugin ID and installation directory: **`niyoj-daymark`**.

The display name avoids a collision with the existing, unrelated Daymark plugin. Keep the stable ID unchanged to retain installed records and settings.

## Release assets

The root contains the manifest, README, license, versions mapping, source, and reproducible build configuration. Git ignores generated bundles, local vaults/records, agent tools, and session artifacts. `main.js` is generated for release attachments rather than committed.

For each release:

1. Update `version` together in `manifest.json` and `package.json`; add the version/minimum-Obsidian mapping to `versions.json`.
2. Write `docs/releases/<version>.md` and update version-specific installation examples in the README.
3. Run `npm ci`, `npm run check`, and `npm run package`. Test with a separate vault.
4. Commit and push the source, then create a tag exactly matching `manifest.version`, for example **`0.1.0`**, without a `v` prefix.
5. Push the tag. The Release workflow builds and validates the source, then publishes **`main.js`**, **`manifest.json`**, and **`styles.css`** as individual GitHub release attachments, plus the convenience ZIP. The individual files are required by Obsidian.
6. Confirm the GitHub Actions run passes and the release contains the three individual assets. Do not replace the source behind an existing published tag; increment the version for fixes.

The CI workflow checks Node 22 and 24. Actions are pinned to reviewed commit SHAs. Release creation uses GitHub’s CLI and the workflow token with repository-contents permission; no separate release token is required.

## Submit to Obsidian

The current process uses the **Obsidian Community directory dashboard**, rather than a new pull request against `community-plugins.json`:

1. Sign into **https://community.obsidian.md** using your Obsidian account.
2. Connect your GitHub account so the directory can verify repository ownership.
3. Open **Plugins → New plugin** and enter **`https://github.com/niyoj/daymark`**.
4. Choose yourself as owner, review the developer policies and maintenance agreement, and submit.
5. Inspect the automated review. Resolve errors in the repository and publish a new version when needed. A repository/release alone does not mean the plugin is approved or discoverable in the app.

Only the account owner can complete the login, account linking, and policy/maintenance agreement. These steps are not performed by the repository workflow.

Suggested listing text:

> Track habits and routines with daily checklists, streak boards, and completion heatmaps inside your notes.

Use the five images in `docs/images/gallery/desktop/` (1200 × 800, 3:2) and the five in `docs/images/gallery/mobile/` (900 × 1600, 9:16). Every PNG is under 5 MB. The [gallery guide](images/gallery/README.md) lists the upload order and documents the emulated mobile previews. The README contains copyable blocks for all four views and explains the empty-block default. Other images in `docs/images/` show actual UI with fictional demo records.

The optional Scriptable companion is separate from the plugin’s core functionality. Keep the physical iOS/Android and widget-access testing limitations clear until device tests have been completed.

Official references, checked on 2026-11-14:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest)
