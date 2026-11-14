# 0.4.2 release verification

Preparation date: 2026-11-14. Community directory submission is intentionally outside this release preparation.

## Automated checks

- Official `eslint-plugin-obsidianmd` recommended configuration, including source, manifest, package metadata, and license checks. No warnings or errors.
- TypeScript with `strict: true`.
- 136 passing tests. Added coverage for malformed saved settings, modern settings refresh, non-default Obsidian configuration folders, malformed property types, invalid YAML roots, and filename validation. Existing note lifecycle, concurrency, execution, locale, keyboard/IME, rendering, and installer checks remain enabled.
- Browser production build with Obsidian as the only external runtime module.
- Release validator checks package/lockfile/manifest versions, compatibility history, bundled dependencies, complete dependency notices, nonempty assets, and SHA-256 checksums.
- `npm audit`: zero reported vulnerabilities after updating vulnerable minimatch 7–10 transitive dependencies to 11.0.1 or later. Older minimatch 3 users retain their compatible version.
- GitHub Actions repeats validation and release packaging from a clean Linux checkout on Node.js 22. See the repository's **Validate plugin** workflow for the result associated with the release commit.

## Obsidian runtime

Application: Obsidian 1.15.1, macOS. Updated the installed plugin from 0.4.1 to 0.4.2, with prior artifacts backed up.

The runtime checks used a newly created, separate QA folder, not the user's existing project/task/event notes:

- Fresh storage and bundled templates.
- Project and task creation with a resolved project link.
- Memo append, task start, pause, resume, finish, multiple sessions, and completion timestamps.
- Custom property persistence and rejection of stale edits after an independent frontmatter change.
- A 23:30–00:30 event retaining its two calendar dates, and event deletion through Obsidian trash.
- Four searchable settings rows and all nine supported languages.
- Changing language through the real settings selector refreshes both settings display and definitions; the original language was restored.
- Sunrise icon registration and plugin readiness after reload.

The QA folder was trashed after verification. Rapid fixture deletion initially produced asynchronous read errors from another enabled plugin (Templater); these occurred against the temporary QA paths. After cleanup and a fresh Daylight reload, the captured runtime error list was empty. Saved plugin settings were compared with their pre-verification backup and matched. Temporary debugger/focus overrides were removed.

## Compatibility evidence

The API baseline remains Obsidian 1.8.7 and is checked by the official API compatibility rule. Obsidian 1.8.7 itself was not executed in this environment. New settings APIs are guarded by `requireApiVersion('1.13.0')`, and tests exercise the legacy and modern paths.

The maintainer confirmed mobile compatibility during this preparation. This is maintainer-provided evidence, not a claim that this environment ran an iOS/Android device or simulator. Mobile support stays enabled in the manifest.

## Distribution and documentation

Both READMEs document manual installation/update, the opening command, offline behavior and data storage, supported platforms, known limits, and third-party attribution. The changelog and release process are included. Complete React, React DOM, and Scheduler MIT notices are embedded in the distributed bundle.
