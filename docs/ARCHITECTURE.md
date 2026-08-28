# Frontier Command — Architecture

## Repository boundaries

| Area | Responsibility | Portable to Unity? |
| --- | --- | --- |
| `game-content/` | Versioned reference balance and campaign data; not yet imported by the web runtime | Yes, after runtime extraction |
| `app/page.tsx` | Current authoritative simulation, Canvas renderer, input, AI, save hydration, and HUD | Rules can be extracted; rendering/input are replaced |
| `app/multiplayer.ts` | Private room transport and synchronization | Protocol concepts are reusable |
| `app/api/multiplayer/` | Web signaling endpoint and room persistence | Web-specific |
| `public/game-art/` | Current runtime sprites and textures | References, UI art, or temporary Unity billboards |
| `docs/` | State, decisions, testing, release history, and technical direction | Yes |

## Source-of-truth boundary

`app/page.tsx` is currently authoritative for live balance and behavior. `game-content/v1/` is a synchronized reference schema and future extraction target; the web client does not import it yet. Any balance change must update both in the same work session until the runtime begins loading the versioned content.

The browser version remains the fast gameplay prototype and a playable release. New systems should separate stable data from engine-specific behavior:

1. Give every unit, structure, upgrade, faction, mission, and reward a stable string ID.
2. Move tunable values and campaign definitions into `game-content/` behind tested runtime loaders.
3. Keep simulation decisions deterministic where practical.
4. Treat rendering, animation, audio, camera, input, and transport as client layers.
5. Version save data and content schemas before story progression ships.

## Incremental refactoring sequence

The current web prototype still concentrates most of the game in `app/page.tsx`. Refactor it in playable slices:

1. Extract pure geometry and shared data types.
2. Extract economy/mining and construction rules with deterministic tests.
3. Extract combat, research, and save hydration with deterministic tests.
4. Extract AI decisions so fog knowledge can be tested independently.
5. Extract Canvas rendering and input controllers.
6. Add campaign loading, objectives, triggers, dialogue, and progression.
7. Define a network command protocol independent of screen coordinates.

Avoid a full rewrite. Each extraction must preserve save compatibility and pass the release checklist.

