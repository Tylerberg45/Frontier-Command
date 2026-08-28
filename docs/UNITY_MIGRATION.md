# Frontier Command — Unity Migration Plan

The goal is not to convert browser sprites into 3D automatically. It is to keep the design and content portable so Unity can become a second client without discarding the working prototype.

## What carries over

- Unit/structure IDs, stats, costs, build times, upgrades, factions, and campaign definitions.
- Map dimensions, objectives, orders, stances, veterancy, construction queues, and save-schema concepts.
- Multiplayer command concepts.
- Existing 2D art as concept reference, UI portraits, loading art, or temporary billboards.

## What Unity replaces

- Canvas rendering with prefabs, materials, lighting, terrain, particles, and animation controllers.
- Pointer handling with Unity’s Input System.
- Browser audio/UI with Unity audio mixers and UI Toolkit or uGUI.
- Current movement with NavMesh, flow fields, or a dedicated RTS pathfinding solution.
- Web peer synchronization with the selected Unity networking stack.

## Recommended order

1. Stabilize the web prototype’s rules and mission format.
2. Extract/test engine-neutral simulation modules and begin loading versioned content.
3. Create a small Unity vertical slice: one map, Worker, Trooper, Tank, Drone, HQ, and one enemy encounter.
4. Import `game-content/v1/balance.json` into typed C# models.
5. Rebuild selection, orders, construction, combat, and camera controls.
6. Add 3D locomotion and attack animation state machines.
7. Load one complete story mission from the shared campaign format.
8. Only then decide whether Unity replaces the web version or ships beside it.

## 3D motion contract

Each unit prefab should expose named gameplay states instead of having story/game code reference clips directly:

- `Idle`
- `Move`
- `MoveEngage`
- `Attack`
- `Damaged`
- `Repair` or `Build` where applicable
- `Destroyed`

Gameplay requests a state; the prefab’s Animator Controller decides how that unit performs it. Upgraded skins and factions can then share rules while using different models and motion.

