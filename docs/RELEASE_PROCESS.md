# Frontier Command — Release Process

## Non-negotiable rule

**No release is finished until GitHub is updated.**

Frontier Command currently has two repositories with separate histories:

- The Sites-managed source repository used to create production versions.
- The public backup/collaboration repository: `Tylerberg45/Frontier-Command`.

The commit hashes will differ. A release is synchronized only when both commits contain the same release tree.

## Required order

1. **Read state:** `AGENTS.md`, `GAME_STATE.md`, `DECISIONS.md`, `BUGS.md`, and `ROADMAP.md`.
2. **Make one coherent change:** preserve save compatibility and existing decisions.
3. **Test:** run lint, the automated test/build, the documentation validator, and all relevant manual sections in `TEST_CHECKLIST.md`.
4. **Update docs:** update game state, decisions/bugs/roadmap/assets as needed, and draft the release entry.
5. **Prepare the Sites checkpoint:** this builds, commits, and pushes the exact Sites source tree and returns its immutable commit/version handoff.
6. **Mirror to GitHub:** copy the exact checkpoint tree to GitHub `main`. Do not manually reconstruct only the files remembered from chat.
7. **Tag GitHub:** create `v<number>` on the exact mirrored release commit and verify the tag resolves to that commit.
8. **Verify both sources:** compare file trees/content and record both exact commits in `RELEASES.md`.
9. **Deploy:** deploy the already-saved Sites version only after the source and GitHub checks pass.
10. **Verify production:** poll the exact deployment to terminal success and record the returned live URL/status.
11. **Close the session:** update `GAME_STATE.md` with current build, stable commits, current work, active regression status, next priorities, and last verified areas.

## Release definition of done

- [ ] Relevant gameplay/manual tests passed.
- [ ] `npm run lint`, `npm test`, and `npm run project:verify` passed.
- [ ] `GAME_STATE.md` has no pending value.
- [ ] `BUGS.md`, `ROADMAP.md`, `DECISIONS.md`, and `ASSETS.md` reflect the change.
- [ ] `RELEASES.md` contains the release number and exact Sites/GitHub commits.
- [ ] Sites source checkpoint is pushed.
- [ ] GitHub `main` contains the exact release tree.
- [ ] GitHub release tag resolves to the mirrored release commit.
- [ ] Saved Sites version points to the checkpoint commit.
- [ ] Production deployment is verified succeeded.

If any item is incomplete, report the release as prepared, saved, or awaiting verification—never as finished.

## Documentation-only commits

Documentation-only cleanup may put GitHub/Sites source ahead of the currently deployed gameplay commit without creating a new production version. `GAME_STATE.md` must continue to identify the exact deployed gameplay commit. A future gameplay release includes the accumulated documentation in both repositories.

