#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh <vault-path>
       DAYLIGHT_VAULT_PATH=<vault-path> ./install.sh

Build Daylight and copy main.js, manifest.json, and styles.css into
<vault-path>/.obsidian/plugins/daylight/. Existing settings are preserved.
Requires Node.js, npm, and an existing Obsidian vault with a .obsidian directory.
EOF
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi
if (( $# > 1 )); then
  usage >&2
  exit 1
fi
vault_path="${1:-${DAYLIGHT_VAULT_PATH:-}}"
if [[ -z "$vault_path" || ! -d "$vault_path/.obsidian" ]]; then
  echo 'Error: Specify an existing vault containing a .obsidian directory.' >&2
  usage >&2
  exit 1
fi

# Resolve the caller's relative vault path before changing to the repository.
vault_path="$(cd -- "$vault_path" && pwd -P)"
repo_path="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
destination="$vault_path/.obsidian/plugins/daylight"
cd -- "$repo_path"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Error: Install Node.js and npm before running this command.' >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --include=dev
fi
npm run build

# Validate every build artifact before touching the installed plugin.
for file in main.js manifest.json styles.css; do
  if [[ ! -s "$file" ]]; then
    echo "Error: Missing build artifact: $file" >&2
    exit 1
  fi
done
mkdir -p -- "$destination"
for file in main.js manifest.json styles.css; do
  # Also support developers whose checkout is already in the plugin directory.
  if [[ ! "$file" -ef "$destination/$file" ]]; then
    cp -- "$file" "$destination/$file"
  fi
done
printf 'Installed Daylight into %s\n' "$destination"
echo 'In Obsidian, enable Daylight or reload it (toggle off/on) to apply changes.'
