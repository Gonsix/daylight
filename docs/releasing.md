# Release process

The repository contains the source, lockfile, documentation, and license notices. `main.js` and `dist/` are generated locally; distribute the built files through GitHub Releases.

## Prepare a release

1. Start from the source commit intended for release, with no unrelated local edits.
2. Update `package.json`, the package-lock root versions, and `manifest.json` to the same `x.y.z` version. Add its minimum supported Obsidian version to `versions.json` and document changes in `CHANGELOG.md`.
3. Run `npm ci` with Node.js 22.13 or later, then `npm run release:prepare`.
4. Confirm official ESLint checks, TypeScript, tests, the browser build, and release checks pass. Inspect the plugin in Obsidian after a fresh install and an upgrade.
5. Commit and push the source. Confirm the GitHub Actions validation job passes on that commit.
6. Create a GitHub Release with the exact tag from `manifest.json`, for example `0.4.2` (no `v` prefix), on that commit. Attach `dist/<version>/main.js`, `manifest.json`, `styles.css`, and `SHA256SUMS`.
7. Download the published assets and verify their SHA-256 checksums against the prepared files.

The build embeds the complete React, React DOM, and Scheduler MIT notices in `main.js`. The release validator rejects unexpected external dependencies, missing license notices, empty assets, and inconsistent version metadata.

## Verification scope

- API baseline: `manifest.json` declares Obsidian 1.8.7. Official `no-unsupported-api` checks cover API calls against that baseline. Settings definitions and refresh use a version guard for the Obsidian 1.13 API; older versions keep the imperative settings screen.
- Test suite: note creation/editing/deletion, stale edit protection, folders, project and parent links, ordering, timestamps, multiple work sessions, localization, settings, startup, installation, keyboard and IME input, and responsive rendering.
- Desktop runtime: record the actual application version and exercised flows in the release verification record. A test harness is not evidence of having run an old Obsidian binary.
- Mobile: supported. The maintainer confirmed mobile compatibility during preparation of 0.4.2. Desktop mobile emulation is recorded separately and is not described as an iOS or Android hardware test.

## Community directory

Publishing a GitHub Release does not submit the plugin to the community directory. The maintainer can separately submit through [Obsidian Community](https://community.obsidian.md) after linking their Obsidian and GitHub accounts. The directory reads the manifest on the repository's default branch and downloads assets from the release whose tag matches its version.

This preparation covers the source, checks, release, and documentation. It does not submit the community listing or announce the plugin.

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Official ESLint plugin](https://github.com/obsidianmd/eslint-plugin)
