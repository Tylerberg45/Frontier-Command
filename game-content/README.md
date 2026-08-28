# Engine-Neutral Game Content

`game-content/` is the planned seam between stable game rules and engine-specific clients.

- `v1/balance.json` mirrors the current live constants as a versioned reference.
- `v1/campaigns/` contains engine-neutral campaign outlines rather than renderer code.
- A future Unity client can deserialize the JSON into typed C# models or generate ScriptableObjects during import.
- Breaking schema changes create a new version directory so existing saves/campaigns keep their declared schema.

## Current limitation

The web client does **not** import these files yet. `app/page.tsx` remains authoritative. Until a tested runtime loader is added, every live balance change must update the source constants and `v1/balance.json` together. Do not claim that editing this JSON changes the game by itself.

Do not put React components, Canvas drawing code, Unity prefabs, or engine-specific asset paths here. This folder is for stable IDs, tunable values, mission definitions, dialogue references, unlocks, objectives, and rewards.

