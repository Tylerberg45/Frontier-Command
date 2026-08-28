# Frontier Command — Active Bugs

Only active or unresolved defects belong here. Move fixed items into `RELEASES.md` and remove them from this file.

## FC-002 — Worker southeast sprite faces southwest

- **Status:** Repair deployed in v105; awaiting live-device confirmation
- **First reported:** Live v103 test, 2026-08-28
- **Reported behavior:** A Worker traveling southeast displayed a frame facing the opposite horizontal direction.
- **Cause:** The four Worker sheets are stored as `N, NW, W, SW / S, SE, E, NE`, while the shared renderer expects `N, NE, E, SE / S, SW, W, NW`.
- **Deployed repair:** Worker frames now use the remap `[0, 7, 6, 5, 4, 3, 2, 1]` across idle, walking, and mining sheets. Other unit atlases are unchanged.
- **Resolution requirement:** On live v105, move a Worker through all eight headings and confirm southeast/southwest and east/west are no longer reversed.

## FC-003 — Satellite Uplink does not independently generate intel

- **Status:** Repair deployed in v105; awaiting live-device confirmation
- **First reported:** Live v103 test, 2026-08-28
- **Reported behavior:** Completing a Satellite Uplink unlocked the map but did not increase intel. The player still had to secure/garrison an Intel Relay to gain intel.
- **Cause:** v102/v103 gated Relay income behind the Uplink instead of making the Uplink the requested intel source.
- **Deployed repair:** One or more operational Uplinks now provide a non-stacking team feed of 0.5 intel/second. Relays generate zero intel and remain optional +5% damage/garrison objectives. Player and AI use the same rule.
- **Resolution requirement:** Confirm the counter gains one intel every two seconds with an operational Uplink and no owned Relay; confirm another Uplink does not double it and loss of all Uplinks stops the feed.
