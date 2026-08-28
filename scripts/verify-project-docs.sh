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

if rg -n 'PENDING_[A-Z0-9_]+' AGENTS.md docs README.md >/dev/null; then
  echo "Project documentation still contains a pending release placeholder:" >&2
  rg -n 'PENDING_[A-Z0-9_]+' AGENTS.md docs README.md >&2
  exit 1
fi

echo "Verified Frontier Command project documentation for ${current_release}."

