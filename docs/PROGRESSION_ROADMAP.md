# Frontier Command Progression Roadmap

Ship one independently testable progression change at a time. Do not combine steps just because they share a screen.

## 1. Command Profile Foundation

- Persist Command XP, Command Level, and unspent Command Points.
- Award Command XP after completed solo matches.
- Credit existing commanders for recorded wins and losses.
- Show the three planned research paths, but do not apply combat effects yet.

## 2. Fire Control

- Add purchase, refund, save, and load behavior for this path only.
- Grant 2% fire rate per rank, to a maximum of five ranks (10%).
- Verify old saves and new unit production before starting the next step.

## 3. Reinforced Frames

- Add 3% maximum health per rank, to a maximum of five ranks (15%).
- Apply the bonus consistently at match start and when new units are produced.
- Verify save migration and unit health behavior before starting the next step.

## 4. Tactical Intelligence

- Add behavior upgrades instead of a large statistical bonus.
- Introduce one behavior at a time, such as counter prioritization, damaged-target focus, or automatic disengagement.
- Give players a clear toggle and compact visual state for each unlocked behavior.

## 5. Blueprints and Pre-Match Loadouts

- Earn blueprint currency separately from Command Points.
- Add one unit blueprint per release: artillery crawler, shield unit, scout, then combat engineer.
- Use limited loadout slots so progression adds strategic options instead of every bonus at once.

## 6. Story Mode Foundation

- Keep mission definitions, objectives, dialogue, rewards, and unlocks separate from the combat engine.
- Build and test one complete mission before expanding the campaign.
- Persist mission completion and story rewards in the command profile.

## 7. Unity Migration Path

- Keep units, balance values, upgrades, missions, and unlocks data-driven.
- Treat the current web renderer and input layer as replaceable clients of those systems.
- Migrate rendering and controls to Unity without rewriting progression and combat rules.
