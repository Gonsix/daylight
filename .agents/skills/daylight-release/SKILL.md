---
name: daylight-release
description: >-
  Follow Daylight's end-to-end workflow from feature changes through validation,
  version bumping, committing/pushing, and publishing a GitHub Release for Obsidian.
  Use when making feature or UI changes, bumping the version, or releasing Daylight.
---

# Daylight Feature-to-Release Workflow

## 1. Feature Implementation Rules

- **Localization**: Whenever UI copy changes, update all 9 locale files under `src/locales/` (`ja`, `en`, `zh-CN`, `zh-TW`, `ko`, `es`, `de`, `fr`, `pt-BR`) with identical keys and numbered placeholders (`{0}`, `{1}`, ...), verified by `tests/i18n.test.ts`.
- **Release policy & CSS**: Never introduce `!important`, `clip-path`, dynamic `<script>` creation, `eval`, or `new Function` (checked by `scripts/release-policy.mjs`). Scope button styles under `.daylight-app`.
- **Tests**: Add or update unit/render tests in `tests/`.

## 2. Local Validation

Run after edits:

```bash
npm run validate
```

This runs `eslint . --max-warnings=0`, `tsc --noEmit`, `npm test`, and `npm run build`.

## 3. Version Increment & Release Preparation

When bumping to version `x.y.z` (no `v` prefix):

1. Update `"version"` to `"x.y.z"` in:
   - `manifest.json`
   - `package.json`
   - `package-lock.json` (both top-level `"version"` and `packages[""].version`)
2. Add `"x.y.z": "<minAppVersion>"` (matching `manifest.json`) to `versions.json`.
3. Add a `## x.y.z` section to `CHANGELOG.md`.
4. Create `docs/releases/x.y.z.md` following the existing release note format (`### Changes in x.y.z`, `### Install or update`, links).
5. Run and confirm `Validated release x.y.z`:

```bash
npm run release:prepare
```

## 4. Commit & Push to `main`

Only commit and push when requested by the user:

- Stage only tracked/new source, test, and release metadata files (never force-add gitignored `main.js` or `dist/`).
- Commit and push to `origin main`.
- Confirm the `Validate plugin` GitHub Actions workflow passes.

## 5. Tag & Publish GitHub Release (Obsidian Store Sync)

Only create/push tags when requested by the user, and never move an already published release tag:

1. Create and push a tag matching `manifest.json` `version` (exact `x.y.z`, no `v` prefix):

   ```bash
   git tag x.y.z && git push origin x.y.z
   ```

2. Wait for `.github/workflows/release.yml` (**Release plugin**) to finish building, attesting, and creating the GitHub Release with `main.js`, `manifest.json`, and `styles.css`.
3. Verify the release is published before checking Obsidian (checking Obsidian while the workflow is still running triggers `No release matches your manifest version`):

   ```bash
   gh run list --limit 5 && gh release list --limit 5
   ```
