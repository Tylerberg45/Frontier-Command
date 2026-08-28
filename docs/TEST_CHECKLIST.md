# Frontier Command — Release Test Checklist

Use this checklist for every gameplay release. Automated tests are necessary but do not yet exercise the Canvas simulation, so the relevant manual sections must also be run.

## Release record

- Release: `v___`
- Date:
- Tester/device/browser:
- Sites source commit:
- GitHub mirror commit:
- New match, migrated save, or both:

## Automated gate

- [ ] `npm run lint`
- [ ] `npm test` (includes production build and artifact validation)
- [ ] `npm run project:verify`
- [ ] No uncommitted release files.
- [ ] Exact release tree is pushed to the Sites source repository.
- [ ] Exact release tree is mirrored to GitHub and the release tag resolves to it.
- [ ] Production deployment status is `succeeded` and returns the Frontier Command URL.

## New match and economy

- [ ] Solo starts with 650 credits, 520 alloy, 0 intel, and 12 power.
- [ ] Multiplayer gives both sides the same starting resources.
- [ ] Starting Worker mines credits after a completed Refinery exists.
- [ ] Directly tapping a credit deposit changes/locks the Worker target.
- [ ] Directly tapping an alloy deposit unloads mismatched cargo, then mines and deposits alloy.
- [ ] Depleted deposits are abandoned and another valid deposit is selected.
- [ ] Worker delivers to the closest completed friendly Refinery and ignores incomplete/destroyed ones.
- [ ] Upkeep begins only above ten combat units and never drives credits below zero.

## Worker state and construction

- [ ] Ground move puts a Worker on hold; tapping a deposit explicitly resumes mining.
- [ ] Construction starts as a wireframe and waits for an assigned Worker.
- [ ] Multiple construction sites remain queued in order.
- [ ] Canceling an untouched wireframe refunds full alloy; started construction refunds 50%.
- [ ] Worker repairs buildings, units, and owned operational Relays while consuming alloy.
- [ ] Auto-repair defaults off; maintenance patrol behaves as labeled.
- [ ] An attacked Worker retreats toward HQ, uses only its weak close defense, waits five safe seconds, and resumes its saved duty.
- [ ] Worker idle, walking, and mining art faces all eight travel directions correctly, especially southeast and southwest.

## Production and research

- [ ] HQ produces Workers; Barracks produces Troopers; Foundry produces Tanks; Uplink produces Ciphers; Hangar produces Drones.
- [ ] Production queue caps at six and shows current item/count/progress.
- [ ] Selling a completed structure returns 50% alloy.
- [ ] Satellite Uplink requires a completed Barracks and Drone Hangar requires an operational Uplink.
- [ ] Match research pauses when the Uplink is unavailable and resumes when it is operational; completed research persists.
- [ ] Doctrine choice is permanent and the alternate doctrine becomes unavailable.
- [ ] Trade Network unlocks Ciphers and Exchanges; Cipher/Exchange income matches the UI.
- [ ] Old saves with legacy Barracks Tank/Drone queues hydrate without losing queued units.

## Intel, fog, and map

- [ ] Tactical map shows its locked state before the Satellite Uplink and cannot move the camera.
- [ ] Completing the Uplink immediately enables the tactical map and starts a 0.5 intel/second (30/minute) team feed.
- [ ] The Uplink feed stops when no Uplink is operational and resumes when one returns.
- [ ] Additional Uplinks do not stack the intel feed.
- [ ] Relays generate no intel; they remain optional garrison and +5% damage objectives.
- [ ] Unscouted Relays and enemies are absent from Tactical Fog information.
- [ ] AI does not route to a Relay until its own vision has scouted it.
- [ ] Relay capture, four-Trooper garrison, bunker shielding, destruction, repair, and rebuild cycle work.
- [ ] Each controlled Relay grants exactly +5% team damage.
- [ ] After the Satellite Uplink is complete, Open Intel intentionally reveals the map while preserving all other rules.

## Combat and commands

- [ ] Counter triangle is readable: Trooper > Drone > Tank > Trooper.
- [ ] Drone receives its anti-structure multiplier; mixed armies receive no damage bonus.
- [ ] Direct Move keeps the destination and only fires at targets already in range.
- [ ] Engage pursues enemies while traveling.
- [ ] Sentry/Hold range mode appears for Troopers, not Tanks.
- [ ] Patrol, retreat, repair, and auto-repair state indicators match behavior.
- [ ] Four quick-select squads save, recall, add/remove, and discard dead unit IDs.
- [ ] Formations preserve role rows and travel together without a damage bonus.
- [ ] Tank hull remains visually stable while moving/firing; no sprite squashing.

## Save, end state, and progression

- [ ] Autosave and manual save restore units, structures, queues, resources, fog, squads, research, and Worker duty.
- [ ] A save made during Worker retreat loads into a valid retreat/resume state.
- [ ] Older saves migrate without resetting the single commander profile.
- [ ] Win/loss records once, awards Command XP once, and changes the main-menu action to New Match.
- [ ] Persistent Fire Control purchase/refund/save/load remains correct.
- [ ] Primary objectives appear in the pause menu; no irrelevant visible wave countdown returns.

## Mobile and desktop UI

- [ ] iPhone 15 Pro Max portrait: command tray fits, scrolls intentionally, and leaves useful battlefield space.
- [ ] iPad portrait width that exposed v102 text clipping: no vertical letter stacks or out-of-bounds labels.
- [ ] Landscape layout preserves canvas, top bar, minimap, and command access.
- [ ] Pinch zoom, touch pan, select, double-tap type select, long-press travel chooser, and minimap tap work.
- [ ] Desktop drag-select, right-click command, shift-add, control groups, keyboard shortcuts, Escape, and drag pan work.
- [ ] Tooltip toggle hides optional terrain/control guidance without hiding essential state.

## Private multiplayer

- [ ] Host creates a six-character code and guest joins from a second device.
- [ ] Tactical Fog/Open Intel choice is shared correctly.
- [ ] Host and guest see correctly swapped teams, resources, objectives, doctrines, and win/loss state.
- [ ] Commands, production, combat, and construction stay synchronized.
- [ ] Opening a menu does not pause the other player.
- [ ] Solo save/load is unavailable during multiplayer.
- [ ] Disconnect, expired room, full room, and failed direct connection produce understandable recovery messages.
