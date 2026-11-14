# Changelog

## 0.4.5

- Simplify the bundled event, task, and project templates to frontmatter only, with empty bodies.
- Leave new note bodies empty when no memo or project goal is entered.
- Add Notes and Goal sections only when their input is provided; preserve custom template content.
- Skip version 0.4.4. Existing vault templates remain unchanged to preserve user customizations.

## 0.4.3

- Replace the React DOM renderer with Preact's documented compatibility layer, removing unused runtime script-resource loaders from the distributed bundle.
- Preserve native input, IME, modal, timeline, and Kanban behavior with the new renderer.
- Replace four `!important` declarations with plugin-scoped selectors, and use an offscreen live-region style instead of `clip-path`.
- Check built JavaScript and CSS against the reported review findings before packaging.
- Generate GitHub build-provenance attestations and publish only the three Obsidian-supported assets from a validated tag workflow.

## 0.4.2

- Adopt the orange sunrise icon in the view tab, ribbon, and README titles.
- Align the README title icon with the text in both languages.
- Rename the opening command to **Open dashboard** to avoid repeating the plugin name.
- Add searchable settings in Obsidian 1.13 and later, retaining the settings screen on older supported versions.
- Respect the vault's configured Obsidian settings directory when reading property types.
- Validate YAML, saved settings, and property type declarations before using them.
- Keep the Japanese IME composition guard and handle asynchronous form actions explicitly.
- Add official Obsidian lint checks, regression coverage, CI, release validation, and bundled third-party license notices.

## 0.3.3

Previous public release. See the [GitHub release history](https://github.com/Gonsix/daylight/releases) for earlier versions.
