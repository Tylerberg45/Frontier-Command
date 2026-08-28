import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `Missing function ${name}`);
  assert.notEqual(end, -1, `Missing function ${nextName}`);
  return source.slice(start, end);
}

test("direct resource orders clear stale Worker states", () => {
  const body = functionBody("assignWorkersToResource", "cancelWorkerEscape");
  for (const invariant of [
    'clearWorkerConstruction(worker, "mine")',
    "cancelWorkerEscape(worker)",
    "worker.autoRepair = false",
    "worker.repairTarget = undefined",
    "worker.repairRelayTarget = undefined",
    "worker.enemy = undefined",
    "worker.target = undefined",
    "worker.nav = undefined",
    "worker.patrol = undefined",
    "worker.retreating = false",
    "worker.moveEngage = false",
    "worker.formationSpeed = undefined",
    "worker.garrisonTarget = undefined",
    "worker.lastCombatAt = undefined",
    "worker.mining = false",
    "worker.building = false",
    "worker.repairing = false",
  ]) assert.match(body, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("new solo and multiplayer matches start at zero intel", () => {
  const solo = functionBody("initial", "initialMultiplayer");
  const multiplayer = functionBody("initialMultiplayer", "swapTeam");
  assert.match(solo, /intel:\s*0,/);
  assert.match(solo, /enemyIntel:\s*0,/);
  assert.match(multiplayer, /g\.intel\s*=\s*0;/);
  assert.match(multiplayer, /g\.enemyIntel\s*=\s*0;/);
});

test("Satellite Uplink directly generates intel and gates tactical map interaction", () => {
  assert.match(source, /TACTICAL MAP LOCKED — complete the Satellite Uplink/);
  assert.match(source, /const SATELLITE_UPLINK_INTEL_RATE = 0\.5;/);
  assert.match(source, /if \(satelliteUplinkOnline\(g, "player"\)\) g\.intel \+= SATELLITE_UPLINK_INTEL_RATE \* dt;/);
  assert.match(source, /if \(satelliteUplinkOnline\(g, "enemy"\)\) g\.enemyIntel \+= SATELLITE_UPLINK_INTEL_RATE \* dt;/);
  assert.doesNotMatch(source, /objective\.owner === "player"[^\n]*g\.intel \+=/);
  assert.doesNotMatch(source, /objective\.owner === "enemy"[^\n]*g\.enemyIntel \+=/);
});

test("AI relay selection is limited by enemy vision", () => {
  const marker = source.indexOf("const objectiveTarget = (g.objectives || [])");
  assert.notEqual(marker, -1);
  const block = source.slice(marker, marker + 900);
  assert.match(block, /isVisibleFor\(g, "enemy", objective, HIGH_GROUND_RADIUS\)/);
});

test("the active Tank atlas is the eight-direction 2.5D sprite", () => {
  assert.match(source, /load\("tankDirections", "\/game-art\/frontier-tank-2p5d-directions-v1\.png"\)/);
});

test("Worker directional atlases remap their mirrored horizontal frames", () => {
  assert.match(source, /const WORKER_ATLAS_DIRECTION_FRAMES = \[0, 7, 6, 5, 4, 3, 2, 1\] as const;/);
  assert.match(source, /const frame = u\.type === "worker" \? WORKER_ATLAS_DIRECTION_FRAMES\[direction\] : direction;/);
});
