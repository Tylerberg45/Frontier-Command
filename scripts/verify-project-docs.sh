#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_root}"

required_files=(
  AGENTS.md
  docs/GAME_STATE.md
  docs/DECISIONS.md
  docs/BUGS.md
  docs/ROADMAP.md
  docs/RELEASES.md
  docs/TEST_CHECKLIST.md
  docs/ASSETS.md
  docs/RELEASE_PROCESS.md
  docs/ARCHITECTURE.md
  docs/CONTENT_ROADMAP.md
  docs/UNITY_MIGRATION.md
  game-content/README.md
  game-content/v1/balance.json
  game-content/v1/manifest.json
)

for path in "${required_files[@]}"; do
  [[ -s "${path}" ]] || {
    echo "Missing required project-continuity file: ${path}" >&2
    exit 1
  }
done

current_release="$(sed -n 's/| Current production build | \*\*\(v[0-9][0-9]*\)\*\* |/\1/p' docs/GAME_STATE.md)"
[[ "${current_release}" =~ ^v[0-9]+$ ]] || {
  echo "Could not read the current production build from docs/GAME_STATE.md." >&2
  exit 1
}

grep -q "^## ${current_release}$" docs/RELEASES.md || {
  echo "docs/RELEASES.md has no ${current_release} entry." >&2
  exit 1
}

github_stable_commit="$(sed -n 's/| GitHub stable mirror commit | `\([0-9a-f][0-9a-f]*\)` |/\1/p' docs/GAME_STATE.md)"
[[ "${github_stable_commit}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "docs/GAME_STATE.md must record an exact 40-character GitHub stable mirror commit." >&2
  exit 1
}

if grep -RInE 'PENDING_[A-Z0-9_]+' AGENTS.md docs README.md >/dev/null; then
  echo "Project documentation still contains a pending release placeholder:" >&2
  grep -RInE 'PENDING_[A-Z0-9_]+' AGENTS.md docs README.md >&2
  exit 1
fi

echo "Verified Frontier Command project documentation for ${current_release}."
