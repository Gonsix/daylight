# 0.4.3 review fixes and verification

This release addresses the review findings reported for 0.4.2. It does not claim the community directory has already approved 0.4.3.

## Reported findings

| Finding | Change | Verification |
| --- | --- | --- |
| Runtime `createElement('script')` | Replace React DOM with the documented Preact compatibility renderer. Remove React/React DOM dependencies and their script-resource preload implementation entirely. No vendor source patches, string hiding, or scanner suppression. | Production build dependency inventory contains only Preact. The release gate parses built JavaScript and rejects literal script creation, script-markup injection, `eval`, and `new Function`. Regression tests include the former renderer's call pattern. |
| CSS `clip-path` | Position the non-focusable live region offscreen with standard CSS, preserving `aria-live="polite"`. | Stylesheet policy gate and native touch-selection check in Obsidian. |
| Four CSS `!important` declarations | Use plugin-scoped selector specificity for the view padding, detail metadata, delete action, and hint. | Stylesheet policy gate; actual installed view computes 0px padding. |
| Extra `SHA256SUMS` release asset | Keep checksums in local build records, outside the directory published as Obsidian assets. | Release workflow names exactly `main.js`, `manifest.json`, and `styles.css`. |
| Missing artifact attestations | Build and publish tagged releases in GitHub Actions, with `actions/attest@v4` covering all three assets. | Verify each downloaded release file with `gh attestation verify --repo Gonsix/daylight` after the release workflow completes. |

## Automated verification

- Official Obsidian lint configuration: no warnings or errors.
- Strict TypeScript checks, including native Preact event types.
- 138 passing tests, including all existing note lifecycle, startup, storage, execution, ordering, settings, locale, keyboard/IME, responsive rendering, and installer coverage.
- Rendering tests use Preact and its SSR implementation, sharing one runtime across VM fixtures. The selected-option assertion checks HTML semantics instead of one renderer's boolean-attribute serialization.
- The browser production build includes the complete Preact MIT notice, and uses Obsidian as its only external runtime module.
- Release preparation checks metadata, dependency inventory, JavaScript policy, CSS policy, notices, notes, and nonempty assets before publishing.

## Runtime verification

Obsidian 1.15.1 on macOS, installed upgrade from 0.4.2. Existing plugin settings are backed up and retained.

A temporary view and separate QA folder exercised the actual DOM and actual Obsidian storage:

- Native input updates a task composer; modal submission creates the task and unmounts the composer.
- Native composition-ending Enter does not submit while IME composition is active.
- Live search filters and restores cards on native input events.
- Native drag events move a card to another status and start the work session.
- Pause, resume, and finish buttons preserve both work sessions and the completion timestamp.
- Touch pointer selection updates the timeline and accessible live region without `clip-path`.
- Task details render after store and component updates.

The QA leaf is detached and the QA folder is trashed; a plugin reload unregisters the temporary view type and its event listeners. No existing task/project/event note is used as test data. Native iOS/Android hardware was not rerun in this environment; touch input was exercised through the Obsidian desktop renderer.
