# Frontier Command — Active Bugs

Only active or unresolved defects belong here. Move fixed items into `RELEASES.md` and remove them from this file.

## FC-001 — Worker mining and duty-resume regression needs confirmation

- **Status:** Needs reproduction on live v102
- **First reported:** v99-era session, 2026-08-27/28
- **Reported behavior:** Workers stopped mining and could not be made to mine.
- **Current source behavior:** Directly assigning a Worker to a resource clears construction, repair, auto-repair, hold, and emergency-retreat state. An attacked Worker saves its duty, retreats to HQ, waits five safe seconds, and restores that duty.
- **Suspected risk:** The v98 emergency-retreat state may interact with mining/hold state or an older hydrated save. The code path looks repaired, but it has not been verified through the complete live loop.

### Reproduction checklist

1. Start a new solo Tactical Fog match.
2. Build and complete a Refinery.
3. Confirm the starting Worker automatically mines and deposits credits.
4. Select the Worker and tap an alloy deposit; confirm it changes target, unloads mismatched cargo, mines alloy, and deposits it.
5. Give the Worker a ground move/hold order, then tap a deposit; confirm the deposit order restarts mining.
6. Let an enemy damage the Worker; confirm it retreats toward HQ and only fires at a close threat.
7. After five safe seconds near HQ, confirm it returns to the same deposit/duty.
8. Save during or after the sequence, reload, and confirm the duty remains valid.

### Resolution requirement

Do not close this bug based only on code inspection. Record the tested release, device/browser, save type (new or migrated), and observed result.

