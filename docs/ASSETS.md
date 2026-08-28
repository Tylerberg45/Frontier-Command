# Frontier Command — Asset Registry

All runtime art is under `public/game-art/`. Directional sheets use a 4×2 grid in this order:

```text
N   NE   E   SE
S   SW   W   NW
```

Unless noted otherwise, eight-direction sheets are 2048×1024 with 512×512 source cells. The Canvas renderer applies its own tuned draw box; source-frame dimensions do not determine battlefield scale.

## Units

| Unit/state | Current runtime asset | Status and notes |
| --- | --- | --- |
| Worker idle | `frontier-worker-directions-v2.png` | Current eight-direction base atlas |
| Worker walk A/B | `frontier-worker-walk-b-v3.png`, `frontier-worker-walk-c-v4.png` | Current alternating movement atlases |
| Worker mining | `frontier-worker-mine-v1.png` | Current alternating mining pose |
| Trooper idle | `frontier-trooper-directions-v2.png` | Current eight-direction base atlas |
| Trooper walk A/B | `frontier-trooper-walk-b-v3.png`, `frontier-trooper-walk-c-v4.png` | Current alternating movement atlases |
| Tank idle/move | `frontier-tank-2p5d-directions-v1.png` | **Current 2.5D Tank**, eight directions; hull stays rigid and tread movement is rendered procedurally |
| Strike Drone idle | `frontier-strike-drone-directions-v1.png` | Current eight-direction base atlas |
| Strike Drone move | `frontier-strike-drone-move-b-v2.png` | Current movement alternate |
| Cipher mobile | `frontier-cipher-directions-v1.png` | Current eight-direction mobile atlas |
| Cipher deployed | `frontier-cipher-deployed-v1.png` | Current full-image deployed state; transition uses opacity |
| Trooper Sentry | `frontier-turret-directions-v1.png` | Reused for deployed Trooper Sentry pose |

### Current battlefield draw boxes

| Unit | Width × height |
| --- | --- |
| Worker | 58 × 62 |
| Trooper | 56 × 60 |
| Tank | 112 × 104 |
| Strike Drone | 86 × 70 |
| Cipher | 62 × 62 mobile; 76 × 58 deployed |

## Buildings and world art

| Subject | Current runtime asset | Notes |
| --- | --- | --- |
| HQ, Refinery, Barracks, Exchange | `frontier-buildings-atlas-v1.png` | 768×768 2×2 atlas; Exchange reuses/tints the Refinery frame |
| Armor Foundry | `frontier-armor-foundry-v1.png` | 512×512 standalone |
| Satellite Uplink | `frontier-intelligence-center-v1.png` | 512×512 standalone; filename keeps the old name for compatibility/history |
| Drone Hangar | `frontier-drone-hangar-v1.png` | 512×512 standalone |
| Sentry Turret | `frontier-turret-directions-v1.png` | Eight-direction turret atlas |
| Packed HQ | `frontier-command-crawler-v1.png` | 1536×1280 full-image crawler |
| Intel Relay | `frontier-intel-relay-bunker-v1.png` | 1254×1254 standalone bunker |
| Resource deposit | `frontier-crystal-v1.png` | 512×512; credit/alloy coloration is rendered in code |
| Terrain | `frontier-terrain-v1.webp` | 768×768 tiled battlefield texture |

## Loaded fallback atlases

- `frontier-units-atlas-v1.png` remains the non-directional fallback.
- `frontier-buildings-atlas-v1.png` remains the shared building fallback/atlas.

## Present but not used by the current renderer

These files are retained for comparison or possible future work, but `app/page.tsx` does not currently load them for battlefield rendering:

- `frontier-tank-directions-v2.png` — previous Tank base atlas, replaced by the 2.5D atlas.
- `frontier-tank-move-b-v3.png` and `frontier-tank-move-c-v4.png` — previous whole-body movement swaps; retired to keep the hull rigid.
- `frontier-trooper-fire-v1.png`, `frontier-tank-fire-v1.png`, and `frontier-turret-fire-v1.png` — firing currently uses a procedural muzzle/barrel cue to avoid body misalignment.
- `frontier-tactical-plateau-v1.png` — retained, but elevated terrain is disabled in web matches.

## Source-file policy

- No Blender source is currently stored in the repository.
- When Blender/Meshi source begins, store the editable source under `art-source/<subject>/`, record tool/version and export settings here, and keep exported runtime files under `public/game-art/`.
- Add new art one unit/building at a time. Record frame grid, direction order, draw size, animation use, and the replaced/deprecated filename in this file.
- Do not delete a save-compatible or historical runtime asset until source references and old-save fallbacks have been checked.
