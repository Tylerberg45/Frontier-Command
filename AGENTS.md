# Frontier Command Agent Instructions

This repository, not chat memory, owns project continuity.

## Start every work session here

Read these files before proposing or making gameplay changes:

1. `docs/GAME_STATE.md`
2. `docs/DECISIONS.md`
3. `docs/BUGS.md`
4. `docs/ROADMAP.md`
5. `docs/TEST_CHECKLIST.md`
6. `docs/ASSETS.md` when art or animation is involved
7. `docs/RELEASES.md` when preparing or diagnosing a release
8. `docs/ARCHITECTURE.md` and `game-content/README.md` before extracting systems or changing engine-neutral content

Then inspect the current source. The priority order is:

1. Actual source code
2. Git history and release tags
3. Repository documentation
4. Conversation memory

If code and documentation disagree, treat the code as current behavior and repair the documentation in the same change.

## Hard release rule

No Frontier Command release is finished until both the Sites source repository and `Tylerberg45/Frontier-Command` on GitHub contain the exact released source snapshot.

Follow `docs/RELEASE_PROCESS.md`. In short:

1. Make the change.
2. Test it against `docs/TEST_CHECKLIST.md`.
3. Update the project documents.
4. Commit and push the Sites source checkpoint.
5. Mirror the exact released tree to GitHub and create the release tag.
6. Verify both remote snapshots.
7. Deploy the already-saved Sites version.
8. Record the final version and exact commits in `docs/GAME_STATE.md` and `docs/RELEASES.md`.

Do not claim that a release is complete if GitHub is behind, the production deployment is unverified, or the release record still contains a pending placeholder.

## Compatibility guardrails

- Preserve old solo saves unless a migration is deliberately documented and tested.
- Keep internal serialized type names stable. The Satellite Uplink is still stored as building type `intelligence` for save compatibility.
- Multiplayer has no solo-style save/load and opening a menu must not pause the other player.
- Do not restore elevated terrain, a mixed-army damage bonus, commander save slots, or a visible wave-countdown objective without a new explicit design decision.
- Do not let the AI use hidden relay coordinates under fog.
