# Frontier Command — Design Decisions

This file records deliberate decisions. Do not silently reverse them because an older implementation, asset, or chat suggests something else. Add a new dated entry when a decision changes.

## Product and platform

### D-001 — Touch-first web RTS

**Decision:** Frontier Command remains a touch-first web RTS that also supports mouse and keyboard. Portrait and landscape are both supported; portrait usability is a release requirement.

### D-002 — Serializable simulation for eventual Unity migration

**Decision:** Keep match state, balance, progression, missions, and unlocks data-driven/serializable so Unity can later replace rendering and input without redefining the game.

### D-003 — Flat web battlefield

**Decision:** Elevated plateaus and their gameplay bonuses are retired from the web prototype. Dormant helpers may remain for future Unity work, but web matches must not restore cliff collision or high-ground damage without a new decision.

### D-004 — Chats are work sessions, not the project archive

**Decision:** The repository owns exact state and history. New sessions read the project documents and source rather than relying on conversation memory.

## Economy, intel, and objectives

### D-005 — Intel is a mid-game system

**Decision:** New matches begin at zero intel. The Satellite Uplink is the mid-game gateway to strategic intel.

### D-006 — Tactical map requires the Satellite Uplink

**Decision:** The minimap/tactical map is locked until an operational Satellite Uplink exists. Before that, the map panel explains the requirement and cannot move the camera.

### D-007 — Relays do not generate intel without an Uplink

**Decision:** Captured Intel Relays grant intel income only while the owning team has an operational Satellite Uplink. Relay combat and garrison rules remain separate.

### D-008 — Intel must be discovered fairly

**Decision:** The AI may not target hidden Intel Relay coordinates under fog. It must bring its own vision close enough to scout a relay before committing to it. Player enemy-tech information is also limited by scouting.

### D-009 — Objectives live in the pause menu

**Decision:** Primary objectives are shown in the pause menu. The visible wave countdown is not a player objective; internal AI attack waves may still drive pacing.

### D-010 — Depleting resources and late-game income

**Decision:** Credit/alloy deposits deplete. Long games use Trade Network, deployed Ciphers, and Trade Exchanges as their renewable credit economy rather than infinite starting crystals.

## Units and production

### D-011 — Dedicated production buildings

**Decision:** Barracks produces Troopers, Armor Foundry produces Tanks/ground vehicles, Satellite Uplink produces Ciphers/research, and Drone Hangar produces Drones/air units. Do not move Tanks or Drones back into the Barracks UI. Legacy queues are hydrated only to protect old saves.

### D-012 — Workers retreat and resume duty

**Decision:** A Worker under attack retreats toward its HQ, has only a weak close-range defensive attack, waits until safe, and then resumes its saved mining, construction, repair, or patrol duty. A new direct player order cancels the escape state.

### D-013 — Worker orders persist deliberately

**Decision:** Ground move orders put Workers on hold instead of silently resuming mining. Direct deposit selection explicitly returns them to mining. Construction can be queued, and auto-repair is off by default.

### D-014 — Mobile Headquarters trades capability for relocation

**Decision:** The HQ can pack into a very slow Command Crawler. While packed or relocating, production, supply, research, and reinforcement systems are offline.

## Combat and control

### D-015 — Explicit counter triangle

**Decision:** Troopers counter Drones, Drones counter Tanks, and Tanks counter Troopers. Drones also have the explicit anti-structure role.

### D-016 — No mixed-army damage bonus

**Decision:** Mixed armies may gain formation spacing/cohesion and travel behavior, but there is no hidden or visible mixed-army damage bonus.

### D-017 — Direct Move and Engage are different

**Decision:** Direct Move preserves the destination and permits firing only at enemies already in range. Engage allows pursuit during travel.

### D-018 — Sentry mode belongs to Troopers

**Decision:** Hold Ground/Sentry range transformation applies to Troopers. Tanks do not receive Sentry mode.

### D-019 — Four persistent squads

**Decision:** The touch UI provides exactly four persistent quick-select squad slots. Desktop control groups may remain richer, but the mobile grid stays compact.

### D-020 — Firing should not squash painted sprites

**Decision:** Keep the painted body stable and communicate firing with a short barrel/muzzle cue. Do not swap in misaligned whole-body firing frames merely to show recoil.

## Progression and multiplayer

### D-021 — Persistent progression adds choices gradually

**Decision:** Command XP and small persistent upgrades are introduced one independently testable path at a time. Blueprints/loadout limits should add strategic options rather than stacking every bonus simultaneously.

### D-022 — Private multiplayer stays direct and symmetrical

**Decision:** Private 1v1 uses six-character room codes and direct peer data. No AI participates. Solo save/load does not apply, and opening a menu cannot pause the opponent.

### D-023 — Single local commander profile

**Decision:** Separate Tyler/Gabriel commander save slots were removed. Preserve the single local profile and its migration path unless a new account-based system is deliberately designed.

## Release management

### D-024 — GitHub synchronization is a release gate

**Decision:** No release is complete until the exact released tree is present in both the Sites source repository and `Tylerberg45/Frontier-Command` on GitHub. Record both commit identities because the repositories have separate histories.

