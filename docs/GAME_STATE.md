# Frontier Command — Game State

> Read this file first in every new work session. Last updated: 2026-08-28.

## Current release

| Field | Value |
| --- | --- |
| Current production build | **v102** |
| Production status | Live and verified |
| Live URL | https://frontier-command.tylerberg45.chatgpt.site |
| Sites production source commit | `340ea6fff0dec39cf34c95d75852ac1fc732d43f` |
| GitHub stable mirror commit | Historical v102 mirror was not recorded; the first complete synchronization is being prepared as v103 |
| GitHub repository | https://github.com/Tylerberg45/Frontier-Command |
| Runtime | React 19 + TypeScript + Canvas + Vinext/Cloudflare |
| Last automated verification | 2026-08-28: build, lint, and rendered-HTML test passed for v102 source |

The Sites repository and GitHub repository have separate histories. Compare trees/content, not commit IDs, when verifying that they match.

## Current work session

- **Currently working on:** making the repository the permanent source of project continuity and synchronizing GitHub to v102.
- **Known regression under verification:** the user reported Workers would not mine in the v99-era build. The v102 source contains explicit resource assignment and retreat-duty restoration, but the full mining/retreat loop still needs a fresh device smoke test.
- **Most recent gameplay milestone:** Satellite Uplink gates both tactical-map access and relay intel income; starting intel is zero.

## What exists now

### Match and platform

- Touch-first Canvas RTS that supports iPhone portrait, landscape, pinch zoom, click/touch minimap navigation, and mouse/keyboard RTS controls.
- Installable PWA with local solo autosave and manual save/load.
- Adaptive solo AI with easiest-to-expert presentation, randomized resource fields, real resource spending, production, teching, scouting, and attacks.
- Private two-player matches through six-character room codes and direct WebRTC data channels.
- Tactical Fog and Open Intel match choices. Fog remembers explored cells but only currently visible enemies are shown.
- Flat 3000×1900 battlefield. Elevated plateaus are retired in the web version.

### Economy and map control

- Credits buy units; alloy builds and repairs structures; intel funds match research; power is tracked as infrastructure capacity.
- Workers mine depleting credit and alloy deposits and deliver to the closest completed friendly Refinery.
- Workers can be assigned directly to a specific deposit, queue construction sites, repair, or run maintenance patrols.
- Two capturable Intel Relays generate intel only while their owner has an operational Satellite Uplink.
- Relays provide +5% team damage each, can hold four Troopers, shield their garrison, can be destroyed, and rebuild after a cooldown.
- Trade Network unlocks Ciphers and Trade Exchanges for late-game credit income.
- Army upkeep begins above ten combat units; units outside supply eventually deal 25% less damage.

### Production tree

```text
Headquarters
└── Barracks
    ├── Armor Foundry
    └── Satellite Uplink
        └── Drone Hangar
```

- Headquarters: Workers, Fortify Base, pack/deploy mobile Command Crawler.
- Barracks: Troopers only.
- Armor Foundry: Tanks only.
- Satellite Uplink: tactical map, relay intel, Ciphers, doctrines, and match research. Internal save type remains `intelligence`.
- Drone Hangar: Strike Drones only.
- Sentry Turret: automatic point defense.
- Trade Exchange: late-game credit income, boosted by a nearby deployed Cipher.

### Units and combat

- Worker: miner/builder/repair unit with a very weak short-range attack. When attacked, it automatically retreats toward HQ, defends itself only at close range, waits for safety, and resumes its saved duty.
- Trooper: anti-air infantry; the only mobile unit with Sentry/Hold Ground range bonus; can garrison Intel Relays.
- Tank: anti-infantry armor using the current eight-direction 2.5D tank atlas.
- Strike Drone: anti-armor air unit with a separate 1.6× structure multiplier.
- Cipher: noncombat economic specialist; deploys for income after Trade Network research.
- Counter triangle: Trooper → Drone → Tank → Trooper, at 1.55× damage.
- Direct Move keeps the destination and fires only at targets already in range. Engage may pursue.
- Four persistent quick-select squads and coordinated formations are supported. Formations share pace and gain a modest travel-speed bonus, not a damage bonus.
- Veterans rank up to rank 3, gain damage/max health, and regenerate continuously at higher ranks.

### Research and progression

- Match doctrine is a permanent choice between Air Superiority and Armored Command.
- Match upgrades have three levels: Fire Control (+8% fire rate/level), Reinforced Frames (+10% unit HP/level), and Tactical Intelligence (+6% combat range per level). The UI currently says “range + sensors,” but team vision radius is not increased in the source.
- Persistent Command XP and Command Level exist across solo matches.
- Persistent Command Fire Control has five ranks at +2% fire rate per rank, maximum +10%.
- Further persistent progression paths, blueprints, loadouts, and story mode remain roadmap work.

## Current balance snapshot

| Item | Current rule |
| --- | --- |
| Solo start | 650 credits, 520 alloy, 0 intel, 12 power |
| Multiplayer start | Both sides: 650 credits, 520 alloy, 0 intel, 12 power |
| Unit costs | Worker 150; Trooper 125; Tank 400; Drone 300; Cipher 300 credits |
| Structure costs | Refinery 260; Barracks 360; Foundry 500; Satellite Uplink 420; Hangar 480; Turret 240; Exchange 480 alloy |
| Production queue | Six units maximum per production structure |
| Relay capture | 10 seconds; four Trooper garrison slots |
| Relay economy | 0.5 intel/second while owned and Satellite Uplink is operational |
| Relay combat bonus | +5% damage each, maximum two relays |
| Upkeep | None through 10 combat units; nonlinear credit drain above 10 |
| Easiest AI opening | First major attack no earlier than roughly 240 seconds and only with a real army |
| Sell/refund | Built structures return 50%; untouched wireframes return full cost; started construction returns 50% |

## Known problems and risks

- Worker mining/retreat behavior is not yet re-verified end to end on the live v102 build. Track it as `FC-001` in `BUGS.md`.
- The construction tray overflow fix shipped in v102 but needs confirmation on the same iPad/iPhone widths that showed the original clipped text.
- Automated coverage currently proves buildability and rendered metadata, not the game simulation. The manual release checklist remains mandatory until simulation tests are added.
- Sites and GitHub are separate repositories. A Sites deployment can succeed while GitHub remains stale unless the release process is followed.

## Next priorities

1. Reproduce and verify credit/alloy mining, direct deposit assignment, Worker retreat, and automatic duty resumption.
2. Verify the Satellite Uplink progression loop: zero starting intel, locked map, relay discovery, and post-build intel income for both player and AI.
3. Continue the 2.5D sprite pass beyond the current Tank while preserving eight-direction readability and unit scale.
4. Add deterministic simulation tests for mining, construction queues, fog-limited AI knowledge, save hydration, and production.
5. Run a focused private multiplayer regression pass for Tactical Fog, room reconnect/failure behavior, and host/guest perspective swapping.

## New-chat handoff prompt

Use this at the beginning of a new session:

> Continue Frontier Command. Read `AGENTS.md`, `docs/GAME_STATE.md`, and the current roadmap from GitHub before making changes. Treat the source code as authoritative and do not finish a release until both Sites and GitHub are synchronized.
