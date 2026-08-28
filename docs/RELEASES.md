# Frontier Command — Releases

Record every production release with its exact Sites source commit and exact GitHub mirror commit. The two repositories have separate histories, so their hashes are expected to differ even when their trees match.

## v103

- **Released:** 2026-08-28
- **Sites source commit:** `a9965d127935624baa7818421b370f006f346688`
- **GitHub stable mirror commit:** `38e1441f8d08f7485d4f9700a70c588ee11c8ffb`
- **Changes:** Added the repository-owned continuity system, release process, decisions/bugs/roadmap/test/asset registries, permanent GitHub quality gate, and five game-source invariants. Repaired direct Worker resource orders so all stale retreat/combat/repair/construction transients are cleared before mining resumes. Synchronized the full deployable v103 source and the 2.5D Tank asset to GitHub.
- **Verification:** Sites checkpoint build and artifact validation passed; lint completed with no errors; five source-invariant tests passed; every deployable local blob matched GitHub; production deployment status succeeded.
- **Follow-up:** `FC-001` remains open only for a live device mining/retreat smoke test.

## v102

- **Released:** 2026-08-28
- **Sites source commit:** `340ea6fff0dec39cf34c95d75852ac1fc732d43f`
- **Historical GitHub mirror:** Not recorded at release time; v102 was superseded by the first complete synchronized release.
- **Changes:** Renamed the Intelligence Center experience to Satellite Uplink; new matches start at zero intel; tactical map is unavailable until the Uplink is operational; captured Relays only generate intel while their owner has an Uplink; fixed narrow construction-button text overflow.
- **Verification:** Build, lint, rendered-HTML test, and production deployment status passed. Device gameplay smoke tests remain listed in `TEST_CHECKLIST.md`.

## v101

- **Prepared:** 2026-08-28
- **Sites source commit:** `814afc4f76e2dd100c6fea1ff2dd89d8c16d85a5`
- **Historical GitHub mirror:** Not recorded at release time.
- **Changes:** Made build wrappers portable when Railway/container mounts do not permit directly executing repository scripts.
- **Production note:** Saved as a Sites version but superseded by v102 before a production deployment.

## v100

- **Released:** 2026-08-28
- **Sites source commit:** `b182c09ee272863741bb8763607dfd7478d8cec7`
- **Historical GitHub mirror:** Not recorded at release time.
- **Changes:** Prevented the AI from selecting hidden Intel Relays through the global objective list; AI now needs its own vision before targeting a Relay under fog.

## v99

- **Released:** 2026-08-27
- **Sites source commit:** `3e22cd8e333cb98ad5b5c2a72fe5cb25b93c5374`
- **Historical GitHub mirror:** Not recorded at release time.
- **Changes:** Added and activated the eight-direction 2.5D Tank atlas `frontier-tank-2p5d-directions-v1.png`.

## v98

- **Released:** 2026-08-27
- **Sites source commit:** `fad72a5170c2d94fe3049152faa745929737ed55`
- **Historical GitHub mirror:** Not recorded at release time.
- **Changes:** Workers save their current duty when attacked, retreat toward HQ with a weak close-range defense, wait until safe, and resume their previous duty.

## v97

- **Released:** 2026-08-24
- **Sites source commit:** `ce1e3896f33ba4a716680a734d2c454c0e4a401f`
- **Historical GitHub mirror tip:** `215fb9fa922a9b1d4b0c509c405f42cd8a51924b`
- **Changes:** Added four persistent quick-select squads and compact mobile squad controls; coordinated formation travel gained a small cohesion speed bonus.

## v96

- **Released:** 2026-08-24
- **Sites source commit:** `d82a4e7fa64e095a7a1a8aa5b35815fdacd151fd`
- **Historical GitHub mirror:** `9a426d48cf81d77aeb577ba5b4e0940ef691e34c`
- **Changes:** Split production across Barracks, Armor Foundry, Intelligence Center/Satellite Uplink, and Drone Hangar; preserved legacy queues for old saves.

## v95

- **Released:** 2026-08-24
- **Sites source commit:** `718f3839601a634f7ccb5b3f09a66a878c7d9436`
- **Historical GitHub mirror:** `1d01871235bb68313aab403e57f4e6c37ded71d1`
- **Changes:** Compacted the iPhone command tray and improved portrait battlefield space.

## Earlier history

Earlier milestones remain in Git history. They include private room-code multiplayer, fog modes, desktop controls, randomized resources, tactical economy/logistics, Intel Relay garrisons, production queues, mobile HQ, maintenance patrols, Command XP, Fire Control persistence, Trade Network/Ciphers, formations, and the flat-terrain decision. Backfill a numbered release only when an exact production version-to-commit mapping is known; do not guess.
