# Unity migration plan

The goal is not to convert browser sprites into 3D automatically. It is to keep the game design and content portable so Unity can become a second client without discarding the working prototype.

## What carries over

- Unit and structure IDs, stats, costs, build times, upgrades, factions, and campaign definitions
- Map dimensions, objectives, choke-point concepts, orders, stances, veterancy, and construction queues
- Multiplayer command concepts and save-schema design
- Existing 2D art as concept reference, UI portraits, loading art, or temporary billboards

## What Unity replaces

- Canvas rendering with prefabs, materials, lighting, terrain, particles, and animation controllers
- Pointer handling with Unity's Input System
- Browser audio and UI with Unity audio mixers and UI Toolkit/uGUI
- Current movement with NavMesh, flow fields, or a dedicated RTS pathfinding solution
- Web peer synchronization with the selected Unity networking stack

## Recommended order

1. Stabilize the web prototype's rules and mission format.
2. Create a small Unity vertical slice: one map, Worker, Trooper, Tank, Drone, HQ, and one enemy encounter.
3. Import `game-content/v1/balance.json` into typed C# models.
4. Rebuild selection, orders, construction, combat, and camera controls.
5. Add 3D locomotion and attack animation state machines.
6. Load one complete story mission from the shared campaign format.
7. Only then choose whether Unity replaces the web version or ships alongside it.

## 3D motion requirement

Each unit prefab should expose named states rather than story scripts referring to animation clips directly:

- `Idle`
- `Move`
- `MoveEngage`
- `Attack`
- `Damaged`
- `Repair` or `Build` where applicable
- `Destroyed`

Gameplay code requests a state; the prefab's Animator Controller decides how that unit performs it. Upgraded skins and factions can then share rules while using different models and motion.
