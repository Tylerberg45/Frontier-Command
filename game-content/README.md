# Engine-neutral game content

`game-content/` is the long-term seam between game rules and game clients.

- The current web client imports balance values from `v1/balance.json`.
- Future story missions live under `v1/campaigns/` instead of being hard-coded into a renderer.
- A future Unity client can deserialize the same versioned JSON into C# data classes or generate ScriptableObjects from it during import.
- Breaking changes create a new version directory. Existing saves and campaigns keep their declared schema version.

Do not put React components, Canvas drawing code, Unity prefabs, or engine-specific asset references here. This folder is for stable IDs, balance values, mission definitions, dialogue references, unlocks, objectives, and rewards.
