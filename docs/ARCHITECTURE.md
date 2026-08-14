# Frontier Command architecture

## Repository boundaries

| Area | Responsibility | Portable to Unity? |
| --- | --- | --- |
| `game-content/` | Versioned balance and campaign data | Yes, directly |
| `app/page.tsx` | Current web simulation, Canvas renderer, input, and HUD | Rules can be ported; rendering/input are replaced |
| `app/multiplayer.ts` | Private room transport and synchronization | Protocol concepts are reusable |
| `app/api/multiplayer/` | Web signaling endpoint | Web-specific |
| `public/game-art/` | Current 2D sprites and textures | Useful as references, UI art, or temporary Unity billboards |
| `docs/` | Technical direction and content planning | Yes |

## Direction

The browser version remains the fast gameplay prototype and a playable release. New systems should separate stable data from engine-specific behavior:

1. Give every unit, structure, upgrade, faction, mission, and reward a stable string ID.
2. Put tunable values and campaign definitions in `game-content/`.
3. Keep simulation decisions deterministic where practical.
4. Treat rendering, animation, audio, camera, and input as client layers.
5. Version save data and content schemas before story progression ships.

## Refactoring sequence

The current web prototype still concentrates much of the simulation in `app/page.tsx`. Refactor it incrementally while keeping each deployment playable:

1. Extract pure geometry, combat, economy, construction, and pathfinding modules.
2. Add tests around those pure modules.
3. Extract Canvas rendering and input controllers.
4. Add campaign loading, objectives, triggers, dialogue, and save progression.
5. Define a network command protocol independent of screen coordinates.

Avoid a full rewrite until the rules are stable enough to justify it.
