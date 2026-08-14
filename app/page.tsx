"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import balance from "@/game-content/v1/balance.json";
import {
  hostRoom,
  joinRoom,
  type MultiplayerRole,
  type PeerSession,
  type PeerStatus,
} from "./multiplayer";

type P = { x: number; y: number };
type Doctrine = "air" | "armor";
type Unit = {
  id: number;
  team: "player" | "enemy";
  type: "worker" | "trooper" | "tank" | "drone";
  x: number;
  y: number;
  hp: number;
  max: number;
  target?: P;
  /** Temporary obstacle-avoidance waypoint. */
  nav?: P;
  /** Transient path recovery data used to escape blocked obstacle routes. */
  navCheckAt?: number;
  navCheckX?: number;
  navCheckY?: number;
  navSide?: 1 | -1;
  /** Ramp route that forces ground units through a real plateau entrance or exit. */
  plateauRoute?: { plateauId: number; rampIndex: number; phase: "approach" | "enter" | "exit" | "clear" };
  enemy?: number;
  carrying?: number;
  /** The resource currently in the worker's cargo hold. */
  carryingType?: ResourceKind;
  xp?: number;
  level?: number;
  /** Active-match timestamp of the unit's most recent dealt or received damage. */
  lastCombatAt?: number;
  /** Last travel/aim angle in canvas radians. Preserved while the unit is idle. */
  facing?: number;
  /** Transient render flag. True only on frames where the unit actually advances. */
  moving?: boolean;
  /** When true, the unit fights nearby threats but keeps its travel destination. */
  moveEngage?: boolean;
  /** Brief firing pose window, expressed in active match time. */
  attackUntil?: number;
  /** Transient render flag while a worker is actively extracting crystal. */
  mining?: boolean;
  /** Transient render flag while a Worker welds an unfinished structure. */
  building?: boolean;
  /** Seconds of field supply remaining before the unit suffers penalties. */
  supply?: number;
  retreating?: boolean;
  /** Workers with this enabled repair friendly units and structures instead of mining. */
  autoRepair?: boolean;
  repairTarget?: number;
  /** Persistent worker duty. Move orders become hold duty instead of resuming mining. */
  workerMode?: "mine" | "hold" | "construct" | "repair";
  buildTarget?: number;
  /** Ordered construction sites assigned to this Worker. */
  buildQueue?: number[];
  /** Combat behavior selected from the contextual command bar. */
  stance?: "pursue" | "hold" | "patrol";
  patrol?: { a: P; b: P; next: "a" | "b" };
  repairing?: boolean;
};
type Production = {
  type: Unit["type"];
  elapsed: number;
  duration: number;
  queue?: Unit["type"][];
};
type Building = {
  id: number;
  team: "player" | "enemy";
  type: "hq" | "refinery" | "barracks" | "turret";
  x: number;
  y: number;
  hp: number;
  max: number;
  progress?: number;
  /** Construction time in seconds. Older saves without it keep their original timing. */
  constructionDuration?: number;
  /** The structure remains a wireframe until an assigned Worker reaches it. */
  constructionStarted?: boolean;
  production?: Production;
  rally?: P;
  /** Last tracked sentry aim angle and brief firing-pose window. */
  turretFacing?: number;
  turretFireUntil?: number;
  /** Short recovery window after a production burst. */
  cooldown?: number;
  /** A packed HQ becomes a very slow tracked command crawler. */
  packed?: boolean;
  mobileTarget?: P;
  mobileFacing?: number;
  relocation?: { mode: "pack" | "deploy"; elapsed: number; duration: number };
};
type ResourceKind = "credits" | "alloy";
type Crystal = { x: number; y: number; amount: number; kind?: ResourceKind };
type Objective = {
  id: number;
  x: number;
  y: number;
  owner: "player" | "enemy" | "neutral";
  capture: number;
};
type Shot = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  team: "player" | "enemy";
  kind: "bullet" | "shell";
  life: number;
  maxLife: number;
};
type DamageNumber = { x: number; y: number; amount: number; life: number; team: "player" | "enemy" };
type AttackAlert = {
  targetId: number;
  team: "player" | "enemy";
  x: number;
  y: number;
  startedAt: number;
  expiresAt: number;
};
type Game = {
  units: Unit[];
  buildings: Building[];
  crystals: Crystal[];
  objectives: Objective[];
  shots: Shot[];
  damageNumbers: DamageNumber[];
  attackAlerts: AttackAlert[];
  credits: number;
  enemyCredits: number;
  alloy: number;
  enemyAlloy: number;
  intel: number;
  enemyIntel: number;
  power: number;
  enemyPower?: number;
  wave: number;
  time: number;
  selected: number[];
  camera: P;
  zoom: number;
  mode: "select" | "move" | "move-engage" | "move-hq" | "repair" | "set-patrol-a" | "set-patrol-b" | "build-refinery" | "build-barracks" | "build-turret" | "set-rally";
  message: string;
  over: "" | "won" | "lost";
  nextId: number;
  waveAt: number;
  aiThinkAt: number;
  aiActionAt: number;
  aiAttackAt: number;
  adaptive: number;
  resultRecorded?: boolean;
  matchStats: MatchStats;
  /** One bit per map cell.  A cell stays revealed after a player has seen it. */
  fogSeen: number[];
  /** Player-selected match rule. Older saves default to tactical fog. */
  fogEnabled: boolean;
  fortified?: boolean;
  fortifyProduction?: { elapsed: number; duration: number };
  enemyFortified?: boolean;
  enemyFortifyProduction?: { elapsed: number; duration: number };
  doctrine?: Doctrine;
  doctrineProduction?: { type: Doctrine; elapsed: number; duration: number };
  enemyDoctrine?: Doctrine;
  enemyDoctrineProduction?: { type: Doctrine; elapsed: number; duration: number };
  enemyDoctrineKnown?: boolean;
  scoutedEnemyDoctrine?: Doctrine | "none";
  mapVersion?: number;
};

const SAVE_KEY = "frontier-command-save-v1";
const MANUAL_SAVE_KEY = "frontier-command-manual-save-v1";
const PROFILE_KEY = "frontier-command-difficulty-v1";
const COMMAND_PROFILE_KEY = "frontier-command-command-profile-v1";
const COMMANDER_KEY = "frontier-command-active-commander-v1";
const SINGLE_SAVE_MIGRATION_KEY = "frontier-command-single-save-migrated-v1";

function migrateCommanderStorage() {
  if (typeof window === "undefined" || localStorage.getItem(SINGLE_SAVE_MIGRATION_KEY)) return;
  const selected = localStorage.getItem(COMMANDER_KEY) === "Gabriel" ? "gabriel" : "tyler";
  const migrate = (target: string, suffix: string) => {
    const selectedValue = localStorage.getItem(`frontier-command-${selected}-${suffix}-v1`);
    const fallbackValue = localStorage.getItem(`frontier-command-${selected === "tyler" ? "gabriel" : "tyler"}-${suffix}-v1`);
    const value = selectedValue || localStorage.getItem(target) || fallbackValue;
    if (value) localStorage.setItem(target, value);
  };
  migrate(SAVE_KEY, "save");
  migrate(MANUAL_SAVE_KEY, "manual-save");
  migrate(PROFILE_KEY, "difficulty");
  localStorage.removeItem(COMMANDER_KEY);
  localStorage.setItem(SINGLE_SAVE_MIGRATION_KEY, "1");
}

type MatchStats = {
  playerActions: number;
  meaningfulActions: number;
  orders: number;
  unitsBuilt: number;
  combatUnitsBuilt: number;
  unitsLost: number;
  enemyUnitsDestroyed: number;
  baseDamage: number;
  peakArmy: number;
  totalCreditsSpent: number;
  startedAt: number;
};
type MatchReview = MatchStats & { result: "won" | "lost"; duration: number; score: number; summary: string; commandXp?: number };
type DifficultyProfile = { wins: number; losses: number; recent: ("won" | "lost")[]; skill: number; reviews: MatchReview[] };
type CommandProfile = { xp: number; spentPoints: number; lastAward: number };
const emptyStats = (): MatchStats => ({ playerActions: 0, meaningfulActions: 0, orders: 0, unitsBuilt: 0, combatUnitsBuilt: 0, unitsLost: 0, enemyUnitsDestroyed: 0, baseDamage: 0, peakArmy: 0, totalCreditsSpent: 0, startedAt: 0 });
function readDifficulty(): DifficultyProfile {
  if (typeof window === "undefined") return { wins: 0, losses: 0, recent: [], skill: 0, reviews: [] };
  try {
    migrateCommanderStorage();
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") as Partial<DifficultyProfile> | null;
    return {
      wins: Math.max(0, Number(p?.wins) || 0),
      losses: Math.max(0, Number(p?.losses) || 0),
      recent: Array.isArray(p?.recent) ? p!.recent.filter((x) => x === "won" || x === "lost").slice(-5) as ("won" | "lost")[] : [],
      skill: Math.max(0, Math.min(100, Number(p?.skill) || 0)),
      reviews: Array.isArray(p?.reviews) ? p!.reviews.slice(-5) as MatchReview[] : [],
    };
  } catch { return { wins: 0, losses: 0, recent: [], skill: 0, reviews: [] }; }
}
function commandXpForLevel(level: number) {
  const bounded = Math.max(1, Math.floor(level));
  return 50 * (bounded - 1) * bounded;
}
function commandLevelForXp(xp: number) {
  let level = 1;
  while (xp >= commandXpForLevel(level + 1)) level++;
  return level;
}
function readCommandProfile(): CommandProfile {
  if (typeof window === "undefined") return { xp: 0, spentPoints: 0, lastAward: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(COMMAND_PROFILE_KEY) || "null") as Partial<CommandProfile> | null;
    if (stored) {
      return {
        xp: Math.max(0, Math.floor(Number(stored.xp) || 0)),
        spentPoints: Math.max(0, Math.floor(Number(stored.spentPoints) || 0)),
        lastAward: Math.max(0, Math.floor(Number(stored.lastAward) || 0)),
      };
    }
    // Existing commanders keep credit for matches completed before the
    // progression system was introduced.
    const history = readDifficulty();
    return { xp: history.wins * 100 + history.losses * 40, spentPoints: 0, lastAward: 0 };
  } catch {
    return { xp: 0, spentPoints: 0, lastAward: 0 };
  }
}
function commandProfileProgress(profile: CommandProfile) {
  const level = commandLevelForXp(profile.xp);
  const floor = commandXpForLevel(level);
  const ceiling = commandXpForLevel(level + 1);
  return {
    level,
    points: Math.max(0, level - 1 - profile.spentPoints),
    current: profile.xp - floor,
    needed: ceiling - floor,
    progress: Math.max(0, Math.min(1, (profile.xp - floor) / Math.max(1, ceiling - floor))),
  };
}
function adaptiveDifficulty(): number {
  const p = readDifficulty();
  if (p.wins === 0 && p.losses === 0 && p.recent.length === 0) return 0.82;
  return Math.max(0.82, Math.min(1.18, 0.82 + (p.skill / 100) * 0.36));
}
function difficultyInfo(value: number) {
  const level = Math.max(1, Math.min(5, Math.round(((value - 0.82) / 0.36) * 4) + 1));
  const labels = ["EASIEST", "EASY", "STANDARD", "HARD", "EXPERT"];
  return { level, label: labels[level - 1] };
}
function isEasiest(value: number) {
  return value <= 0.87;
}
function saveResult(result: "won" | "lost", g: Game) {
  const commandProfile = readCommandProfile();
  const p = readDifficulty();
  p[result === "won" ? "wins" : "losses"]++;
  p.recent = [...p.recent, result].slice(-5);
  const s = g.matchStats;
  const army = g.units.filter((u) => u.team === "player" && u.type !== "worker").length;
  const efficiency = Math.min(25, s.combatUnitsBuilt * 1.5 + s.enemyUnitsDestroyed * 2 - s.unitsLost * 1.25);
  const economy = Math.min(20, s.unitsBuilt * 1.2 + Math.min(8, s.totalCreditsSpent / 600));
  const discipline = Math.max(-20, Math.min(20, 12 - s.baseDamage / 35 - s.unitsLost * 0.8));
  const minutes = Math.max(1, g.time / 60);
  const effectiveApm = s.meaningfulActions / minutes;
  const orderApm = s.orders / minutes;
  const clickEfficiency = s.playerActions > 0
    ? s.meaningfulActions / s.playerActions
    : 0;
  const activity = Math.min(12, effectiveApm * 0.9);
  const control = Math.min(6, orderApm * 1.5) + Math.min(4, clickEfficiency * 4);
  const score = Math.max(0, Math.min(100, (result === "won" ? 48 : 25) + efficiency + economy + discipline + activity + control + Math.min(12, army * 1.2)));
  const summary = result === "won"
    ? score >= 75 ? "Dominant win" : score >= 58 ? "Strong win" : "Close win"
    : score >= 48 ? "Promising loss" : "Learning match";
  p.skill = Math.round(Math.max(0, Math.min(100, p.skill * 0.7 + score * 0.3)));
  const controlledUplinks = (g.objectives || []).filter((objective) => objective.owner === "player").length;
  const participation = Math.max(.2, Math.min(1, g.time / 240));
  const commandXp = Math.max(8, Math.round((score * .6 + (result === "won" ? 45 : 18) + controlledUplinks * 8) * participation));
  p.reviews = [...p.reviews, { ...s, result, duration: g.time, score, summary, commandXp }].slice(-5);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  localStorage.setItem(COMMAND_PROFILE_KEY, JSON.stringify({
    ...commandProfile,
    xp: commandProfile.xp + commandXp,
    lastAward: commandXp,
  } satisfies CommandProfile));
}

// The battlefield is intentionally larger than the viewport. The minimap is the
// fast way to jump around it on touch screens.
const W = balance.world.width,
  H = balance.world.height;
const PLAYER_BASE = { x: 320, y: H / 2 } as const;
const ENEMY_BASE = { x: W - 320, y: H / 2 } as const;
const FOG_CELL = 50;
const FOG_COLS = Math.ceil(W / FOG_CELL);
const FOG_ROWS = Math.ceil(H / FOG_CELL);
const FOG_COUNT = FOG_COLS * FOG_ROWS;
type TacticalPlateau = { id: number; x: number; y: number; rx: number; ry: number; rotation: number; ramps: readonly [number, number] };
const TACTICAL_PLATEAUS: readonly TacticalPlateau[] = [
  // The art is an almost-square mesa with diagonal ramps. Keep the smooth
  // collision perimeter just inside the visible cliff face so ground units do
  // not snag on transparent sprite padding or appear to hit an invisible wall.
  { id: -101, x: W / 2, y: H / 2 - 300, rx: 188, ry: 188, rotation: 0, ramps: [-Math.PI / 4, Math.PI * 3 / 4] },
  { id: -102, x: W / 2, y: H / 2 + 300, rx: 188, ry: 188, rotation: 0, ramps: [-Math.PI / 4, Math.PI * 3 / 4] },
] as const;
const angleDelta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Cliff segments form a closed elevated perimeter except at two real ramp gaps.
// Ground units must enter through a choke; Drones may fly over the entire ridge.
const TERRAIN_RIDGES = TACTICAL_PLATEAUS.flatMap((plateau, plateauIndex) =>
  Array.from({ length: 28 }, (_, index) => {
    const angle = (index / 28) * Math.PI * 2;
    const localAngle = angle - plateau.rotation;
    if (plateau.ramps.some((ramp) => angleDelta(localAngle, ramp) < .3)) return null;
    return {
      id: -(200 + plateauIndex * 40 + index),
      x: plateau.x + Math.cos(angle) * plateau.rx,
      y: plateau.y + Math.sin(angle) * plateau.ry,
      r: 27,
      plateauId: plateau.id,
    };
  }).filter((ridge): ridge is { id: number; x: number; y: number; r: number; plateauId: number } => Boolean(ridge)),
);
const HIGH_GROUND_RADIUS = 92;
const UPLINK_DAMAGE_BONUS = balance.objectives.damageBonusEach;
type VisionSource = P & { r: number };

function teamVision(g: Game, team: Unit["team"]): VisionSource[] {
  return [
    ...g.units
      .filter((u) => u.team === team && u.hp > 0)
      .map((u) => ({ x: u.x, y: u.y, r: u.type === "worker" ? 145 : u.type === "drone" ? 330 : 190 })),
    ...g.buildings
      .filter((b) => b.team === team && b.hp > 0)
      .map((b) => ({ x: b.x, y: b.y, r: b.type === "hq" ? (b.packed ? 190 : 300) : 230 })),
  ];
}
function playerVision(g: Game): VisionSource[] {
  return teamVision(g, "player");
}
function isVisibleFor(g: Game, team: Unit["team"], point: P, padding = 0) {
  if (!g.fogEnabled) return true;
  return teamVision(g, team).some((v) => Math.hypot(v.x - point.x, v.y - point.y) <= v.r + padding);
}
function isVisible(g: Game, point: P, padding = 0) {
  return isVisibleFor(g, "player", point, padding);
}
function hasDiscovered(g: Game, point: P) {
  if (!g.fogEnabled) return true;
  const col = Math.max(0, Math.min(FOG_COLS - 1, Math.floor(point.x / FOG_CELL)));
  const row = Math.max(0, Math.min(FOG_ROWS - 1, Math.floor(point.y / FOG_CELL)));
  return Boolean(g.fogSeen?.[row * FOG_COLS + col]);
}
function objectiveIntel(g: Game, objective: Objective) {
  const visible = isVisible(g, objective, HIGH_GROUND_RADIUS);
  return { visible, discovered: visible || hasDiscovered(g, objective) };
}
function revealFog(g: Game) {
  if (!Array.isArray(g.fogSeen) || g.fogSeen.length !== FOG_COUNT) g.fogSeen = Array(FOG_COUNT).fill(0);
  if (!g.fogEnabled) {
    g.fogSeen.fill(1);
    return;
  }
  const vision = playerVision(g);
  for (let row = 0; row < FOG_ROWS; row++)
    for (let col = 0; col < FOG_COLS; col++) {
      const cx = col * FOG_CELL + FOG_CELL / 2;
      const cy = row * FOG_CELL + FOG_CELL / 2;
      if (vision.some((v) => Math.hypot(v.x - cx, v.y - cy) <= v.r + FOG_CELL)) {
        g.fogSeen[row * FOG_COLS + col] = 1;
      }
    }
}
const stats = {
  worker: { r: balance.units.worker.radius, speed: balance.units.worker.speed, damage: balance.units.worker.damage, range: balance.units.worker.range, rate: balance.units.worker.attackSeconds },
  trooper: { r: balance.units.trooper.radius, speed: balance.units.trooper.speed, damage: balance.units.trooper.damage, range: balance.units.trooper.range, rate: balance.units.trooper.attackSeconds },
  tank: { r: balance.units.tank.radius, speed: balance.units.tank.speed, damage: balance.units.tank.damage, range: balance.units.tank.range, rate: balance.units.tank.attackSeconds },
  drone: { r: balance.units.drone.radius, speed: balance.units.drone.speed, damage: balance.units.drone.damage, range: balance.units.drone.range, rate: balance.units.drone.attackSeconds },
};
const buildingStats = {
  hq: { r: balance.structures.hq.radius },
  refinery: { r: balance.structures.refinery.radius },
  barracks: { r: balance.structures.barracks.radius },
  turret: { r: balance.structures.turret.radius },
};
const buildingHealth = { hq: balance.structures.hq.health, refinery: balance.structures.refinery.health, barracks: balance.structures.barracks.health, turret: balance.structures.turret.health };
const turretStats = { damage: balance.turret.damage, range: balance.turret.range, rate: balance.turret.attackSeconds };
const buildingBuildTime = { refinery: balance.structures.refinery.buildSeconds, barracks: balance.structures.barracks.buildSeconds, turret: balance.structures.turret.buildSeconds };
const FORTIFY_DURATION = balance.research.fortifySeconds;
const unitHealth = { worker: balance.units.worker.health, trooper: balance.units.trooper.health, tank: balance.units.tank.health, drone: balance.units.drone.health };
const unitCost = { worker: balance.units.worker.cost, trooper: balance.units.trooper.cost, tank: balance.units.tank.cost, drone: balance.units.drone.cost };
const unitBuildTime = { worker: balance.units.worker.buildSeconds, trooper: balance.units.trooper.buildSeconds, tank: balance.units.tank.buildSeconds, drone: balance.units.drone.buildSeconds };
const MAX_QUEUE = balance.production.maxQueue;
const BUILD_COST = { refinery: balance.structures.refinery.alloyCost, barracks: balance.structures.barracks.alloyCost, turret: balance.structures.turret.alloyCost } as const;
const FORTIFY_INTEL_COST = balance.research.fortifyIntelCost;
const OBJECTIVE_CAPTURE_TIME = balance.objectives.captureSeconds;
const OBJECTIVE_INTEL_RATE = balance.objectives.intelPerSecond;
const SUPPLY_CAPACITY = balance.supply.capacitySeconds;
const SUPPLY_RADIUS = balance.supply.radius;
const DOCTRINE_INTEL_COST = balance.research.doctrineIntelCost;
const DOCTRINE_DURATION = balance.research.doctrineSeconds;
const PRODUCTION_COOLDOWN = balance.production.cooldownSeconds;
const UPKEEP_SOFT_CAP = balance.economy.upkeepSoftCap;
const REPAIR_RATE = balance.repair.healthPerSecond;
const REPAIR_ALLOY_PER_HP = balance.repair.alloyPerHealth;
const MAINTENANCE_PATROL_SCAN = 185;
const SENTRY_RANGE_MULTIPLIER = 1.35;
const TUTORIALS_KEY = "frontier-command-tutorials-v1";
const DISMISSED_TIPS_KEY = "frontier-command-dismissed-tips-v1";
function veteranRegenRate(unit: Unit) {
  const level = unit.level || 1;
  return level >= 3 ? 0.02 : level >= 2 ? 0.01 : 0;
}
function unitCombatRange(unit: Unit) {
  return stats[unit.type].range * (unit.type !== "worker" && unit.stance === "hold" ? SENTRY_RANGE_MULTIPLIER : 1);
}
function upkeepPerSecond(count: number) {
  return count <= UPKEEP_SOFT_CAP ? 0 : Math.pow(count - UPKEEP_SOFT_CAP, 1.25) * .08;
}
function productionDurationFor(g: Game, team: Unit["team"], type: Unit["type"]) {
  if (type === "worker") return unitBuildTime.worker;
  const barracks = g.buildings.filter((building) => building.team === team && building.type === "barracks" && buildingOperational(building)).length;
  return unitBuildTime[type] * (1 + Math.max(0, barracks - 1) * .18);
}
function supplyMultiplier(unit: Unit) {
  return (unit.supply ?? SUPPLY_CAPACITY) <= 0 ? 0.75 : 1;
}
function teamDoctrine(g: Game, team: Unit["team"]) {
  return team === "player" ? g.doctrine : g.enemyDoctrine;
}
function doctrineMultiplier(g: Game, unit: Unit) {
  const doctrine = teamDoctrine(g, unit.team);
  if (doctrine === "air" && unit.type === "drone") return 1.18;
  if (doctrine === "armor" && unit.type === "tank") return 1.18;
  return 1;
}
function counterMultiplier(attacker: Unit, target: Unit | Building) {
  const targetType = target.type;
  if (attacker.type === "trooper" && targetType === "drone") return 1.55;
  if (attacker.type === "drone" && targetType === "tank") return 1.55;
  if (attacker.type === "tank" && targetType === "trooper") return 1.55;
  return 1;
}
function terrainMultiplier(g: Game, attacker: Unit, target: Unit | Building) {
  const controlled = (g.objectives || []).filter((objective) => objective.owner === attacker.team).length;
  const attackerPlateau = attacker.type !== "drone" && plateauAt(attacker);
  const targetPlateau = plateauAt(target);
  const elevation = attackerPlateau && attackerPlateau.id !== targetPlateau?.id ? balance.terrain.plateauDamageMultiplier : 1;
  return (1 + Math.min(2, controlled) * UPLINK_DAMAGE_BONUS) * elevation;
}

function plateauAt(point: P) {
  return TACTICAL_PLATEAUS.find((plateau) => plateauContains(point, plateau, .78, .76));
}
function plateauContains(point: P, plateau: TacticalPlateau, scaleX = 1, scaleY = scaleX) {
  const dx = point.x - plateau.x, dy = point.y - plateau.y;
  const c = Math.cos(-plateau.rotation), s = Math.sin(-plateau.rotation);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return (lx / (plateau.rx * scaleX)) ** 2 + (ly / (plateau.ry * scaleY)) ** 2 <= 1;
}
function plateauRampPoint(plateau: TacticalPlateau, rampIndex: number, scale: number): P {
  const ramp = plateau.ramps[rampIndex];
  const localX = Math.cos(ramp) * plateau.rx * scale;
  const localY = Math.sin(ramp) * plateau.ry * scale;
  const c = Math.cos(plateau.rotation), s = Math.sin(plateau.rotation);
  return {
    x: plateau.x + localX * c - localY * s,
    y: plateau.y + localX * s + localY * c,
  };
}
function distanceToSegment(point: P, start: P, end: P) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}
function inPlateauRampLane(point: P, padding = 0) {
  return TACTICAL_PLATEAUS.some((plateau) =>
    plateau.ramps.some((_, rampIndex) =>
      distanceToSegment(
        point,
        plateauRampPoint(plateau, rampIndex, .58),
        plateauRampPoint(plateau, rampIndex, 1.34),
      ) <= 56 + padding,
    ),
  );
}
function objectRadius(object: Unit | Building) {
  return object.type === "worker" || object.type === "trooper" || object.type === "tank" || object.type === "drone"
    ? stats[object.type].r
    : buildingStats[object.type].r;
}
function isUnit(object: Unit | Building): object is Unit {
  return ["worker", "trooper", "tank", "drone"].includes(object.type as Unit["type"]);
}
const unitName = (type: Unit["type"]) =>
  type === "tank" ? "TANK" : type === "drone" ? "STRIKE DRONE" : type.toUpperCase();
const unitRole = (type: Unit["type"]) =>
  type === "worker" ? "MINER" : type === "trooper" ? "ANTI-AIR INFANTRY" : type === "tank" ? "ANTI-INFANTRY ARMOR" : "ANTI-ARMOR AIR";
const unitDuty = (unit: Unit) => {
  if (unit.type !== "worker") return `${unitRole(unit.type)}${unit.stance === "hold" ? ` · SENTRY ${Math.round(unitCombatRange(unit))} RANGE` : ""}`;
  if (unit.autoRepair) return `MAINTENANCE${unit.stance === "patrol" ? " PATROL" : ""}${unit.repairing ? " · REPAIRING" : ""}`;
  if (unit.workerMode === "construct") {
    const queued = unit.buildQueue?.length || (unit.buildTarget ? 1 : 0);
    return `CONSTRUCTION DUTY${queued ? ` · ${queued} SITE${queued === 1 ? "" : "S"} QUEUED` : ""}`;
  }
  if (unit.workerMode === "repair") return "REPAIR DUTY";
  if (unit.workerMode === "hold") return "GUARD POST · MINING PAUSED";
  return "MINER";
};
function normalizeUnits(units: Unit[]): Unit[] {
  return units.map((raw) => {
    const type = (raw.type as string) === "walker" ? "tank" : raw.type;
    const base = unitHealth[type];
    const level = Math.max(1, Math.min(3, Number(raw.level) || 1));
    const rankMax = Math.round(base * Math.pow(1.12, level - 1));
    const max =
      Number.isFinite(raw.max) && raw.max > 0
        ? Math.min(raw.max, rankMax)
        : rankMax;
    const hp = Number.isFinite(raw.hp)
      ? Math.max(0, Math.min(raw.hp, max))
      : max;
    return {
      ...raw,
      type,
      max,
      hp,
      xp: Math.max(0, Number(raw.xp) || 0),
      level,
      lastCombatAt: Number.isFinite(raw.lastCombatAt) ? raw.lastCombatAt : undefined,
      facing: Number.isFinite(raw.facing)
        ? raw.facing
        : raw.team === "player" ? 0 : Math.PI,
      moveEngage: Boolean(raw.moveEngage && raw.target),
      supply: Math.max(0, Math.min(SUPPLY_CAPACITY, Number(raw.supply) || SUPPLY_CAPACITY)),
      autoRepair: Boolean(raw.autoRepair),
      repairTarget: Number.isInteger(raw.repairTarget) ? raw.repairTarget : undefined,
      workerMode:
        raw.type === "worker" && ["mine", "hold", "construct", "repair"].includes(raw.workerMode || "")
          ? raw.workerMode
          : raw.type === "worker" ? "mine" : undefined,
      buildTarget: Number.isInteger(raw.buildTarget) ? raw.buildTarget : undefined,
      buildQueue: Array.isArray(raw.buildQueue)
        ? raw.buildQueue.filter((id) => Number.isInteger(id))
        : Number.isInteger(raw.buildTarget) ? [raw.buildTarget!] : [],
      stance: raw.stance === "hold" || raw.stance === "patrol" ? raw.stance : "pursue",
      patrol:
        raw.patrol && raw.patrol.a && raw.patrol.b
          ? {
              a: { x: Number(raw.patrol.a.x) || 0, y: Number(raw.patrol.a.y) || 0 },
              b: { x: Number(raw.patrol.b.x) || 0, y: Number(raw.patrol.b.y) || 0 },
              next: raw.patrol.next === "a" ? "a" : "b",
            }
          : undefined,
    };
  });
}
function repairGameIds(g: Game) {
  const objects = [...g.buildings, ...g.units];
  let next = 1;
  const seen = new Set<number>();
  for (const object of objects) {
    if (!Number.isInteger(object.id) || object.id < 1 || seen.has(object.id)) {
      while (seen.has(next)) next++;
      object.id = next;
    }
    seen.add(object.id);
    next = Math.max(next, object.id + 1);
  }
  g.nextId = Math.max(next, Number.isInteger(g.nextId) ? g.nextId : 1);
}

function buildingOperational(b: Building) {
  return b.hp > 0 && !b.packed && !b.relocation && (b.progress === undefined || b.progress >= 1);
}

function unitInSupplyRange(g: Game, unit: Unit) {
  return g.buildings.some(
    (building) =>
      building.team === unit.team &&
      building.type !== "turret" &&
      buildingOperational(building) &&
      Math.hypot(building.x - unit.x, building.y - unit.y) <= SUPPLY_RADIUS,
  );
}

function hqBlockedAt(g: Game, hq: Building, x: number, y: number, deploying = false) {
  const radius = buildingStats.hq.r * (deploying ? 1 : .8);
  return x < radius + 24 || x > W - radius - 24 || y < radius + 24 || y > H - radius - 24 ||
    g.buildings.some((building) => building.id !== hq.id && building.hp > 0 &&
      Math.hypot(building.x - x, building.y - y) < buildingStats[building.type].r + radius + 14) ||
    g.crystals.some((crystal) => crystal.amount > 0 && Math.hypot(crystal.x - x, crystal.y - y) < radius + 31) ||
    TERRAIN_RIDGES.some((ridge) => Math.hypot(ridge.x - x, ridge.y - y) < ridge.r + radius + 7);
}

function movePackedHq(g: Game, hq: Building, dt: number) {
  if (!hq.mobileTarget || hq.relocation) return;
  const dx = hq.mobileTarget.x - hq.x, dy = hq.mobileTarget.y - hq.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 7) {
    hq.mobileTarget = undefined;
    return;
  }
  const desired = Math.atan2(dy, dx);
  const speed = 12;
  const step = Math.min(distance, speed * dt);
  const steering = [0, .42, -.42, .82, -.82, 1.2, -1.2, Math.PI / 2, -Math.PI / 2];
  const choice = steering
    .map((offset) => {
      const angle = desired + offset;
      return { angle, x: hq.x + Math.cos(angle) * step, y: hq.y + Math.sin(angle) * step };
    })
    .find((candidate) => !hqBlockedAt(g, hq, candidate.x, candidate.y));
  if (!choice) return;
  hq.x = choice.x;
  hq.y = choice.y;
  hq.mobileFacing = choice.angle;
}

function queueWorkerConstruction(worker: Unit, buildingId: number) {
  const queue = Array.isArray(worker.buildQueue) ? worker.buildQueue : [];
  if (!queue.includes(buildingId)) queue.push(buildingId);
  worker.buildQueue = queue;
  worker.buildTarget = queue[0];
  worker.workerMode = "construct";
  worker.repairTarget = undefined;
  worker.enemy = undefined;
  worker.target = undefined;
  worker.nav = undefined;
}

function clearWorkerConstruction(worker: Unit, nextMode: Unit["workerMode"] = "hold") {
  worker.buildQueue = [];
  worker.buildTarget = undefined;
  worker.workerMode = nextMode;
}

function plateauTravelRoute(u: Unit, destination: P) {
  if (u.type === "drone") {
    u.plateauRoute = undefined;
    return undefined;
  }
  let route = u.plateauRoute;
  let plateau = route
    ? TACTICAL_PLATEAUS.find((candidate) => candidate.id === route!.plateauId)
    : undefined;
  if (route && !plateau) {
    u.plateauRoute = undefined;
    route = undefined;
  }
  if (route && plateau) {
    const destinationInside = plateauContains(destination, plateau, 1.08);
    const entering = route.phase === "approach" || route.phase === "enter";
    if ((entering && !destinationInside) || (!entering && destinationInside)) {
      u.plateauRoute = undefined;
      route = undefined;
      plateau = undefined;
    } else if (entering && plateauContains(u, plateau, .76)) {
      u.plateauRoute = undefined;
      return undefined;
    } else if (!entering && route.phase === "clear" && !plateauContains(u, plateau, 1.38)) {
      u.plateauRoute = undefined;
      return undefined;
    }
  }
  if (!route) {
    const insidePlateau = TACTICAL_PLATEAUS.find((candidate) => plateauContains(u, candidate, .98));
    const rampPlateau = TACTICAL_PLATEAUS.find((candidate) =>
      plateauContains(u, candidate, 1.34) && inPlateauRampLane(u, 18),
    );
    const destinationPlateau = TACTICAL_PLATEAUS.find((candidate) => plateauContains(destination, candidate, 1.08));
    plateau = insidePlateau || rampPlateau;
    if (plateau && destinationPlateau?.id === plateau.id) return undefined;
    if (!plateau && !destinationPlateau) return undefined;
    const routePlateau = plateau || destinationPlateau!;
    const rampIndex = routePlateau.ramps
      .map((_, index) => {
        const inner = plateauRampPoint(routePlateau, index, .72);
        const outer = plateauRampPoint(routePlateau, index, 1.28);
        return {
          index,
          cost: plateau
            ? Math.hypot(u.x - inner.x, u.y - inner.y) + Math.hypot(destination.x - outer.x, destination.y - outer.y)
            : Math.hypot(u.x - outer.x, u.y - outer.y) + Math.hypot(destination.x - inner.x, destination.y - inner.y),
        };
      })
      .sort((a, b) => a.cost - b.cost)[0].index;
    route = {
      plateauId: routePlateau.id,
      rampIndex,
      phase: plateau ? (insidePlateau ? "exit" : "clear") : "approach",
    };
    u.plateauRoute = route;
    u.nav = undefined;
    plateau = routePlateau;
  }
  plateau ||= TACTICAL_PLATEAUS.find((candidate) => candidate.id === route!.plateauId);
  if (!plateau) return undefined;
  const outer = plateauRampPoint(plateau, route.rampIndex, 1.28);
  const inner = plateauRampPoint(plateau, route.rampIndex, .72);
  if (route.phase === "approach" && Math.hypot(u.x - outer.x, u.y - outer.y) < 16) {
    route.phase = "enter";
    u.nav = undefined;
  }
  if (route.phase === "enter" && (Math.hypot(u.x - inner.x, u.y - inner.y) < 13 || plateauContains(u, plateau, .76))) {
    u.plateauRoute = undefined;
    u.nav = undefined;
    return undefined;
  }
  if (route.phase === "exit" && Math.hypot(u.x - outer.x, u.y - outer.y) < 13) {
    route.phase = "clear";
    u.nav = undefined;
  }
  if (route.phase === "clear" && !plateauContains(u, plateau, 1.38)) {
    u.plateauRoute = undefined;
    return undefined;
  }
  return {
    goal: route.phase === "approach" ? outer : route.phase === "enter" ? inner : route.phase === "exit" ? outer : destination,
    ignorePlateauId: route.phase === "enter" || route.phase === "exit" || route.phase === "clear" ? plateau.id : undefined,
  };
}

function blockingObstacle(
  g: Game,
  u: Unit,
  destination: P,
  ignoreBuildingId?: number,
  ignorePlateauId?: number,
) {
  const dx = destination.x - u.x;
  const dy = destination.y - u.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1) return undefined;
  const obstacles = [
    ...g.buildings
      .filter((building) => building.hp > 0 && building.id !== ignoreBuildingId)
      .map((building) => ({ id: building.id, x: building.x, y: building.y, r: buildingStats[building.type].r })),
    ...g.crystals
      .map((crystal, index) => ({ crystal, index }))
      .filter(({ crystal }) =>
        crystal.amount > 0 &&
        !inPlateauRampLane(crystal, 28) &&
        Math.hypot(crystal.x - destination.x, crystal.y - destination.y) > 42,
      )
      .map(({ crystal, index }) => ({ id: -(index + 1000), x: crystal.x, y: crystal.y, r: 24 })),
    ...TERRAIN_RIDGES.filter((ridge) => ridge.plateauId !== ignorePlateauId),
  ];
  return obstacles
    .map((obstacle) => {
      const t = Math.max(
        0,
        Math.min(1, ((obstacle.x - u.x) * dx + (obstacle.y - u.y) * dy) / lengthSquared),
      );
      const px = u.x + dx * t;
      const py = u.y + dy * t;
      const clearance = stats[u.type].r + obstacle.r + 12;
      return { obstacle, t, blocked: Math.hypot(obstacle.x - px, obstacle.y - py) < clearance };
    })
    .filter((candidate) => candidate.blocked && candidate.t > 0.04 && candidate.t < 0.96)
    .sort((a, b) => a.t - b.t)[0]?.obstacle;
}

function moveUnitToward(
  g: Game,
  u: Unit,
  destination: P,
  dt: number,
  ignoreBuildingId?: number,
) {
  const plateauRoute = plateauTravelRoute(u, destination);
  const travelDestination = plateauRoute?.goal || destination;
  const ignorePlateauId = plateauRoute?.ignorePlateauId;
  if (
    u.nav &&
    Number.isFinite(u.navCheckAt) &&
    g.time >= (u.navCheckAt || 0)
  ) {
    const progress = Math.hypot(u.x - (u.navCheckX ?? u.x), u.y - (u.navCheckY ?? u.y));
    if (progress < 4) {
      u.nav = undefined;
      u.navSide = u.navSide === 1 ? -1 : 1;
    }
    u.navCheckAt = g.time + 0.65;
    u.navCheckX = u.x;
    u.navCheckY = u.y;
  }
  if (u.nav && Math.hypot(u.nav.x - u.x, u.nav.y - u.y) < 9) u.nav = undefined;
  if (!u.nav) {
    const blocker = u.type === "drone" ? undefined : blockingObstacle(g, u, travelDestination, ignoreBuildingId, ignorePlateauId);
    if (blocker) {
      const dx = travelDestination.x - u.x;
      const dy = travelDestination.y - u.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const forwardX = dx / distance;
      const forwardY = dy / distance;
      const clearance = stats[u.type].r + blocker.r + 22;
      const preferredSide = u.navSide || ((u.id + blocker.id) % 2 === 0 ? 1 : -1);
      const candidates = ([preferredSide, -preferredSide] as const).map((side) => ({
        side,
        point: {
          x: Math.max(20, Math.min(W - 20, blocker.x - forwardY * clearance * side + forwardX * 34)),
          y: Math.max(20, Math.min(H - 20, blocker.y + forwardX * clearance * side + forwardY * 34)),
        },
      }));
      const chosen = candidates.find(({ point }) => {
        const probe = { ...u, x: point.x, y: point.y, nav: undefined };
        return !blockingObstacle(g, probe, travelDestination, ignoreBuildingId, ignorePlateauId);
      }) || candidates[0];
      u.navSide = chosen.side;
      u.nav = chosen.point;
      u.navCheckAt = g.time + 0.65;
      u.navCheckX = u.x;
      u.navCheckY = u.y;
    }
  }
  const goal = u.nav || travelDestination;
  const dx = goal.x - u.x;
  const dy = goal.y - u.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return;
  u.facing = Math.atan2(dy, dx);
  const step = Math.min(distance, stats[u.type].speed * supplyMultiplier(u) * (teamDoctrine(g, u.team) === "air" && u.type === "drone" ? 1.15 : 1) * (u.retreating ? 1.2 : 1) * dt);
  u.moving = step > 0.01;
  u.x = Math.max(stats[u.type].r, Math.min(W - stats[u.type].r, u.x + (dx / distance) * step));
  u.y = Math.max(stats[u.type].r, Math.min(H - stats[u.type].r, u.y + (dy / distance) * step));
}

function recordAttackAlert(g: Game, target: Unit | Building) {
  const alerts = g.attackAlerts || (g.attackAlerts = []);
  const existing = alerts.find((alert) => alert.targetId === target.id && alert.team === target.team);
  if (existing) {
    existing.x = target.x;
    existing.y = target.y;
    existing.expiresAt = g.time + 4.5;
  } else {
    alerts.push({
      targetId: target.id,
      team: target.team,
      x: target.x,
      y: target.y,
      startedAt: g.time,
      expiresAt: g.time + 4.5,
    });
  }
  if (alerts.length > 8) alerts.splice(0, alerts.length - 8);
}

function resourceCluster(
  center: P,
  count: number,
  amount: number,
  kinds: ResourceKind[] = ["credits"],
): Crystal[] {
  const rotation = Math.random() * Math.PI * 2;
  return Array.from({ length: count }, (_, index) => {
    const ring = 54 + index * 25 + Math.random() * 12;
    const angle = rotation + index * ((Math.PI * 2) / count) + (Math.random() - 0.5) * 0.4;
    return {
      x: Math.round(Math.max(70, Math.min(W - 70, center.x + Math.cos(angle) * ring))),
      y: Math.round(Math.max(70, Math.min(H - 70, center.y + Math.sin(angle) * ring))),
      amount,
      kind: kinds[index % kinds.length],
    };
  });
}

function balancedResourceFields(): Crystal[] {
  const openingOffset = 390 + Math.random() * 90;
  const openingY = PLAYER_BASE.y - 170 + Math.random() * 340;
  const playerCenter = { x: PLAYER_BASE.x + openingOffset, y: openingY };
  const enemyCenter = { x: W - playerCenter.x, y: openingY };
  const contestedSpread = 430 + Math.random() * 170;
  const contestedOffset = -150 + Math.random() * 300;
  const contestedA = { x: W / 2 + contestedOffset, y: H / 2 - contestedSpread };
  const contestedB = { x: W / 2 - contestedOffset, y: H / 2 + contestedSpread };
  return [
    ...resourceCluster(playerCenter, 4, 1300, ["credits", "alloy"]),
    ...resourceCluster(enemyCenter, 4, 1300, ["credits", "alloy"]),
    ...resourceCluster(contestedA, 3, 1250, ["credits", "credits", "alloy"]),
    ...resourceCluster(contestedB, 3, 1250, ["alloy", "alloy", "credits"]),
  ];
}

function randomResourceFields(): Crystal[] {
  return balancedResourceFields();
}

function multiplayerResourceFields(): Crystal[] {
  return balancedResourceFields();
}

function mapObjectives(): Objective[] {
  const verticalSpread = 430 + Math.random() * 220;
  const horizontalOffset = -110 + Math.random() * 220;
  return [
    { id: 1, x: W / 2 + horizontalOffset, y: H / 2 - verticalSpread, owner: "neutral", capture: 0 },
    { id: 2, x: W / 2 - horizontalOffset, y: H / 2 + verticalSpread, owner: "neutral", capture: 0 },
  ];
}

function initial(options: { fogEnabled?: boolean } = {}): Game {
  const adaptive = adaptiveDifficulty();
  const easiest = isEasiest(adaptive);
  const fogEnabled = options.fogEnabled ?? true;
  return {
    credits: 650,
    enemyCredits: 550,
    alloy: 520,
    enemyAlloy: 520,
    intel: 40,
    enemyIntel: 40,
    power: 12,
    enemyPower: 12,
    wave: 0,
    time: 0,
    waveAt: easiest ? 240 : 150,
        aiThinkAt: 6,
    aiActionAt: 0,
    aiAttackAt: easiest ? 240 : 150,
    adaptive,
    fogSeen: Array(FOG_COUNT).fill(0),
    fogEnabled,
    matchStats: emptyStats(),
    selected: [],
    camera: { x: 440, y: PLAYER_BASE.y },
    zoom: 1,
    mode: "select",
    message:
      `${easiest ? 240 : 150} seconds to prepare. Mine credits for units, alloy for structures, and capture uplinks for intel. AI level ${adaptive < .95 ? "easing" : adaptive > 1.05 ? "rising" : "steady"}.`,
    over: "",
    fortified: false,
    fortifyProduction: undefined,
    enemyFortified: false,
    enemyFortifyProduction: undefined,
    doctrine: undefined,
    doctrineProduction: undefined,
    enemyDoctrine: undefined,
    enemyDoctrineProduction: undefined,
    enemyDoctrineKnown: false,
    scoutedEnemyDoctrine: undefined,
    mapVersion: 2,
    nextId: 20,
    shots: [],
    damageNumbers: [],
    attackAlerts: [],
    objectives: mapObjectives(),
    units: [
      {
        id: 1,
        team: "player",
        type: "worker",
        x: PLAYER_BASE.x - 5,
        y: PLAYER_BASE.y + 70,
        hp: 70,
        max: 70,
      },
      {
        id: 2,
        team: "player",
        type: "trooper",
        x: PLAYER_BASE.x + 60,
        y: PLAYER_BASE.y + 100,
        hp: 95,
        max: 95,
      },
      {
        id: 3,
        team: "player",
        type: "trooper",
        x: PLAYER_BASE.x + 90,
        y: PLAYER_BASE.y + 80,
        hp: 95,
        max: 95,
      },
      {
        id: 8,
        team: "enemy",
        type: "worker",
        x: ENEMY_BASE.x - 70,
        y: ENEMY_BASE.y - 90,
        hp: 70,
        max: 70,
        xp: 0,
        level: 1,
      },
    ],
    buildings: [
      { id: 4, team: "player", type: "hq", x: PLAYER_BASE.x, y: PLAYER_BASE.y, hp: 900, max: 900 },
      { id: 5, team: "enemy", type: "hq", x: ENEMY_BASE.x, y: ENEMY_BASE.y, hp: 900, max: 900 },
      {
        id: 6,
        team: "enemy",
        type: "barracks",
        x: ENEMY_BASE.x - 80,
        y: ENEMY_BASE.y + 130,
        hp: 520,
        max: 520,
      },
      {
        id: 7,
        team: "enemy",
        type: "refinery",
        x: ENEMY_BASE.x - 20,
        y: ENEMY_BASE.y - 135,
        hp: 440,
        max: 440,
        progress: 1,
      },
    ],
    crystals: randomResourceFields(),
  };
}

function initialMultiplayer(options: { fogEnabled?: boolean } = {}): Game {
  const fogEnabled = options.fogEnabled ?? true;
  const g = initial({ fogEnabled });
  g.credits = 650;
  g.enemyCredits = 650;
  g.alloy = 520;
  g.enemyAlloy = 520;
  g.intel = 40;
  g.enemyIntel = 40;
  g.power = 12;
  g.enemyPower = 12;
  g.wave = 0;
  g.waveAt = Number.MAX_SAFE_INTEGER;
  g.aiThinkAt = Number.MAX_SAFE_INTEGER;
  g.aiActionAt = Number.MAX_SAFE_INTEGER;
  g.aiAttackAt = Number.MAX_SAFE_INTEGER;
  g.message = "PRIVATE 1V1 CONNECTED — destroy the opposing command core.";
  g.units = [
    { id: 1, team: "player", type: "worker", x: PLAYER_BASE.x - 5, y: PLAYER_BASE.y + 70, hp: 70, max: 70, facing: 0 },
    { id: 2, team: "player", type: "trooper", x: PLAYER_BASE.x + 60, y: PLAYER_BASE.y + 100, hp: 95, max: 95, facing: 0 },
    { id: 3, team: "player", type: "trooper", x: PLAYER_BASE.x + 90, y: PLAYER_BASE.y + 80, hp: 95, max: 95, facing: 0 },
    { id: 8, team: "enemy", type: "worker", x: ENEMY_BASE.x + 5, y: ENEMY_BASE.y + 70, hp: 70, max: 70, facing: Math.PI },
    { id: 9, team: "enemy", type: "trooper", x: ENEMY_BASE.x - 60, y: ENEMY_BASE.y + 100, hp: 95, max: 95, facing: Math.PI },
    { id: 10, team: "enemy", type: "trooper", x: ENEMY_BASE.x - 90, y: ENEMY_BASE.y + 80, hp: 95, max: 95, facing: Math.PI },
  ];
  g.buildings = [
    { id: 4, team: "player", type: "hq", x: PLAYER_BASE.x, y: PLAYER_BASE.y, hp: 900, max: 900 },
    { id: 5, team: "enemy", type: "hq", x: ENEMY_BASE.x, y: ENEMY_BASE.y, hp: 900, max: 900 },
  ];
  g.crystals = multiplayerResourceFields();
  g.objectives = mapObjectives();
  g.nextId = 20;
  g.camera = { x: 440, y: PLAYER_BASE.y };
  g.selected = [];
  g.fogSeen = Array(FOG_COUNT).fill(0);
  revealFog(g);
  return g;
}

function swapTeam(team: Unit["team"]): Unit["team"] {
  return team === "player" ? "enemy" : "player";
}

function guestPerspective(authoritative: Game, local: Game | null, firstSnapshot: boolean): Game {
  const view = structuredClone(authoritative);
  view.units = view.units.map((unit) => ({ ...unit, team: swapTeam(unit.team) }));
  view.buildings = view.buildings.map((building) => ({ ...building, team: swapTeam(building.team) }));
  view.shots = view.shots.map((shot) => ({ ...shot, team: swapTeam(shot.team) }));
  view.damageNumbers = view.damageNumbers.map((number) => ({ ...number, team: swapTeam(number.team) }));
  view.attackAlerts = (view.attackAlerts || []).map((alert) => ({ ...alert, team: swapTeam(alert.team) }));
  [view.credits, view.enemyCredits] = [view.enemyCredits, view.credits];
  [view.alloy, view.enemyAlloy] = [view.enemyAlloy, view.alloy];
  [view.intel, view.enemyIntel] = [view.enemyIntel, view.intel];
  view.objectives = (view.objectives || []).map((objective) => ({
    ...objective,
    owner: objective.owner === "player" ? "enemy" : objective.owner === "enemy" ? "player" : "neutral",
    capture: -objective.capture,
  }));
  const hostPower = view.power;
  view.power = view.enemyPower ?? 12;
  view.enemyPower = hostPower;
  [view.fortified, view.enemyFortified] = [view.enemyFortified, view.fortified];
  [view.fortifyProduction, view.enemyFortifyProduction] = [view.enemyFortifyProduction, view.fortifyProduction];
  [view.doctrine, view.enemyDoctrine] = [view.enemyDoctrine, view.doctrine];
  [view.doctrineProduction, view.enemyDoctrineProduction] = [view.enemyDoctrineProduction, view.doctrineProduction];
  view.over = authoritative.over === "won" ? "lost" : authoritative.over === "lost" ? "won" : "";
  view.camera = firstSnapshot ? { x: W - 440, y: ENEMY_BASE.y } : local?.camera || { x: W - 440, y: ENEMY_BASE.y };
  view.zoom = local?.zoom || 1;
  view.selected = (local?.selected || []).filter((id) =>
    [...view.units, ...view.buildings].some((object) => object.id === id && object.team === "player"),
  );
  view.mode = local?.mode || "select";
  view.message = local?.message || "PRIVATE 1V1 CONNECTED — destroy the opposing command core.";
  view.fogSeen = local?.fogSeen?.length === FOG_COUNT ? [...local.fogSeen] : Array(FOG_COUNT).fill(0);
  revealFog(view);
  const enemyHq = view.buildings.find((building) => building.team === "enemy" && building.type === "hq");
  const enemyHqVisible = Boolean(enemyHq && isVisible(view, enemyHq, buildingStats.hq.r));
  view.scoutedEnemyDoctrine = enemyHqVisible ? (view.enemyDoctrine || "none") : local?.scoutedEnemyDoctrine;
  view.enemyDoctrineKnown = view.scoutedEnemyDoctrine !== undefined;
  return view;
}

function repairBuilding(b: Building): Building {
  const max =
    Number.isFinite(b.max) && b.max > 0
      ? b.max
      : buildingHealth[b.type];
  const production =
    b.production && ["worker", "trooper", "tank", "drone"].includes(b.production.type)
      ? {
          ...b.production,
          elapsed: Math.max(0, Number(b.production.elapsed) || 0),
          duration: Math.max(
            1,
            Number(b.production.duration) || unitBuildTime[b.production.type],
          ),
          queue: Array.isArray(b.production.queue)
            ? b.production.queue.filter((type) =>
                ["worker", "trooper", "tank", "drone"].includes(type),
              )
            : [],
        }
      : undefined;
  return {
    ...b,
    max,
    hp: Number.isFinite(b.hp) ? Math.max(0, Math.min(b.hp, max)) : max,
    production,
    constructionDuration:
      b.progress !== undefined
        ? Math.max(
            1,
            Number(b.constructionDuration) ||
              (b.type === "turret" ? buildingBuildTime.turret : 6),
          )
        : undefined,
    constructionStarted:
      b.progress !== undefined && b.progress < 1
        ? Boolean(b.constructionStarted || b.progress > 0)
        : undefined,
    rally:
      b.rally && Number.isFinite(b.rally.x) && Number.isFinite(b.rally.y)
        ? b.rally
        : undefined,
    cooldown: Math.max(0, Number(b.cooldown) || 0),
    packed: b.type === "hq" ? Boolean(b.packed) : undefined,
    mobileTarget:
      b.type === "hq" && b.mobileTarget && Number.isFinite(b.mobileTarget.x) && Number.isFinite(b.mobileTarget.y)
        ? b.mobileTarget
        : undefined,
    mobileFacing: b.type === "hq" && Number.isFinite(b.mobileFacing) ? b.mobileFacing : undefined,
    relocation:
      b.type === "hq" && b.relocation && (b.relocation.mode === "pack" || b.relocation.mode === "deploy")
        ? {
            mode: b.relocation.mode,
            elapsed: Math.max(0, Number(b.relocation.elapsed) || 0),
            duration: Math.max(1, Number(b.relocation.duration) || 5),
          }
        : undefined,
  };
}

function hydrateGame(parsed: Game, message: string): Game {
  if (
    !Array.isArray(parsed.units) ||
    !Array.isArray(parsed.buildings) ||
    !Array.isArray(parsed.crystals)
  ) throw new Error("Invalid save");
  const savedTime = Math.max(0, Number(parsed.time) || 0);
  const savedAdaptive = Math.max(
    0.82,
    Math.min(1.18, Number(parsed.adaptive) || adaptiveDifficulty()),
  );
  const aiAttackAt = isEasiest(savedAdaptive) && (Number(parsed.wave) || 0) === 0
    ? Math.max(Number(parsed.aiAttackAt) || 0, 240)
    : Number(parsed.aiAttackAt) || Math.max(savedTime + 20, 90);
  const repaired: Game = {
    ...parsed,
    credits: Math.max(0, Number(parsed.credits) || 0),
    enemyCredits: Number.isFinite(Number(parsed.enemyCredits))
      ? Math.max(0, Number(parsed.enemyCredits))
      : 650,
    alloy: Number.isFinite(Number(parsed.alloy)) ? Math.max(0, Number(parsed.alloy)) : 520,
    enemyAlloy: Number.isFinite(Number(parsed.enemyAlloy)) ? Math.max(0, Number(parsed.enemyAlloy)) : 520,
    intel: Number.isFinite(Number(parsed.intel)) ? Math.max(0, Number(parsed.intel)) : 40,
    enemyIntel: Number.isFinite(Number(parsed.enemyIntel)) ? Math.max(0, Number(parsed.enemyIntel)) : 40,
    power: Math.max(0, Number(parsed.power) || 0),
    enemyPower: Math.max(0, Number(parsed.enemyPower) || 12),
    wave: Math.max(0, Number(parsed.wave) || 0),
    time: savedTime,
    waveAt: Number(parsed.waveAt) || aiAttackAt,
    aiThinkAt: Math.min(Number(parsed.aiThinkAt) || savedTime, savedTime + 0.25),
    aiActionAt: Number(parsed.aiActionAt) || savedTime,
    aiAttackAt,
    adaptive: savedAdaptive,
    matchStats: { ...emptyStats(), ...(parsed.matchStats || {}) },
    fogSeen: Array.isArray(parsed.fogSeen) && parsed.fogSeen.length === FOG_COUNT
      ? parsed.fogSeen.map((cell) => (cell ? 1 : 0))
      : Array(FOG_COUNT).fill(0),
    fogEnabled: parsed.fogEnabled !== false,
    fortified: Boolean(parsed.fortified),
    fortifyProduction:
      parsed.fortifyProduction && !parsed.fortified
        ? {
            elapsed: Math.max(0, Number(parsed.fortifyProduction.elapsed) || 0),
            duration: Math.max(1, Number(parsed.fortifyProduction.duration) || FORTIFY_DURATION),
          }
        : undefined,
    enemyFortified: Boolean(parsed.enemyFortified),
    enemyFortifyProduction:
      parsed.enemyFortifyProduction && !parsed.enemyFortified
        ? {
            elapsed: Math.max(0, Number(parsed.enemyFortifyProduction.elapsed) || 0),
            duration: Math.max(1, Number(parsed.enemyFortifyProduction.duration) || FORTIFY_DURATION),
          }
        : undefined,
    doctrine: parsed.doctrine === "air" || parsed.doctrine === "armor" ? parsed.doctrine : undefined,
    doctrineProduction:
      (parsed.doctrineProduction?.type === "air" || parsed.doctrineProduction?.type === "armor") && !parsed.doctrine
        ? { type: parsed.doctrineProduction.type, elapsed: Math.max(0, Number(parsed.doctrineProduction.elapsed) || 0), duration: Math.max(1, Number(parsed.doctrineProduction.duration) || DOCTRINE_DURATION) }
        : undefined,
    enemyDoctrine: parsed.enemyDoctrine === "air" || parsed.enemyDoctrine === "armor" ? parsed.enemyDoctrine : undefined,
    enemyDoctrineProduction:
      (parsed.enemyDoctrineProduction?.type === "air" || parsed.enemyDoctrineProduction?.type === "armor") && !parsed.enemyDoctrine
        ? { type: parsed.enemyDoctrineProduction.type, elapsed: Math.max(0, Number(parsed.enemyDoctrineProduction.elapsed) || 0), duration: Math.max(1, Number(parsed.enemyDoctrineProduction.duration) || DOCTRINE_DURATION) }
        : undefined,
    enemyDoctrineKnown: Boolean(parsed.enemyDoctrineKnown),
    scoutedEnemyDoctrine:
      parsed.scoutedEnemyDoctrine === "air" || parsed.scoutedEnemyDoctrine === "armor" || parsed.scoutedEnemyDoctrine === "none"
        ? parsed.scoutedEnemyDoctrine
        : undefined,
    mapVersion: 2,
    shots: [],
    damageNumbers: [],
    attackAlerts: Array.isArray(parsed.attackAlerts)
      ? parsed.attackAlerts
          .filter((alert) => alert && Number.isFinite(alert.targetId) && Number.isFinite(alert.expiresAt))
          .map((alert) => ({
            targetId: alert.targetId,
            team: alert.team === "enemy" ? "enemy" : "player",
            x: Number(alert.x) || 0,
            y: Number(alert.y) || 0,
            startedAt: Number(alert.startedAt) || savedTime,
            expiresAt: Number(alert.expiresAt) || savedTime,
          }))
      : [],
    selected: [],
    mode: "select",
    camera:
      parsed.camera && Number.isFinite(parsed.camera.x) && Number.isFinite(parsed.camera.y)
        ? parsed.camera
        : { x: 440, y: PLAYER_BASE.y },
    zoom: Math.max(0.55, Math.min(1.7, Number(parsed.zoom) || 1)),
    units: normalizeUnits(parsed.units).map((u) => ({
      ...u,
      nav: undefined,
      navCheckAt: undefined,
      navCheckX: undefined,
      navCheckY: undefined,
      plateauRoute: undefined,
      carryingType: u.carryingType === "alloy" ? "alloy" : "credits",
    })),
    buildings: parsed.buildings.map(repairBuilding),
    crystals: parsed.crystals.map((node, index) => ({
      ...node,
      amount: Math.max(0, Number(node.amount) || 0),
      kind: node.kind === "alloy" ? "alloy" : index % 2 === 0 ? "credits" : "alloy",
    })),
    objectives: Array.isArray(parsed.objectives) && parsed.objectives.length
      ? parsed.objectives.map((objective, index) => ({
          id: Number.isInteger(objective.id) ? objective.id : index + 1,
          x: Number.isFinite(objective.x) ? objective.x : W / 2,
          y: Number.isFinite(objective.y) ? objective.y : index === 0 ? 300 : H - 300,
          owner: ["player", "enemy", "neutral"].includes(objective.owner) ? objective.owner : "neutral",
          capture: Math.max(-OBJECTIVE_CAPTURE_TIME, Math.min(OBJECTIVE_CAPTURE_TIME, Number(objective.capture) || 0)),
        }))
      : mapObjectives(),
    message,
  };
  repairGameIds(repaired);
  return repaired;
}
function loadGame(): Game {
  if (typeof window === "undefined") return initial();
  try {
    migrateCommanderStorage();
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return initial();
    const parsed = JSON.parse(saved) as Game;
    return hydrateGame(parsed, "Match resumed from your last autosave.");
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return initial();
  }
}

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<Game>(initial()),
    art = useRef<{
      terrain?: HTMLImageElement;
      terrainLayer?: HTMLCanvasElement;
      units?: HTMLImageElement;
      workerDirections?: HTMLImageElement;
      workerWalk?: HTMLImageElement;
      workerWalkC?: HTMLImageElement;
      trooperDirections?: HTMLImageElement;
      trooperWalk?: HTMLImageElement;
      trooperWalkC?: HTMLImageElement;
      tankDirections?: HTMLImageElement;
      tankMove?: HTMLImageElement;
      tankMoveC?: HTMLImageElement;
      droneDirections?: HTMLImageElement;
      droneMove?: HTMLImageElement;
      trooperFire?: HTMLImageElement;
      tankFire?: HTMLImageElement;
      workerMine?: HTMLImageElement;
      turretDirections?: HTMLImageElement;
      turretFire?: HTMLImageElement;
      buildings?: HTMLImageElement;
      crystal?: HTMLImageElement;
      tacticalPlateau?: HTMLImageElement;
      commandCrawler?: HTMLImageElement;
    }>({}),
    keys = useRef(new Set<string>()),
    pointer = useRef<{
      x: number;
      y: number;
      wx: number;
      wy: number;
      drag: boolean;
      start: P;
    } | null>(null),
    touchPoints = useRef(new Map<number, P>()),
    pinch = useRef<{
      distance: number;
      zoom: number;
      worldMid: P;
    } | null>(null),
    pinchConsumed = useRef(false),
    moveGesture = useRef<{
      timer?: ReturnType<typeof setTimeout>;
      opened: boolean;
      start: P;
      world: P;
      choice: "engage" | "direct" | null;
    } | null>(null),
    last = useRef(0),
    attackTimers = useRef<Record<number, number>>({}),
    lastTap = useRef<{ id: number; time: number } | null>(null),
    controlGroups = useRef<Record<number, number[]>>({}),
    lastGroupKey = useRef<{ group: number; time: number } | null>(null),
    matchStarted = useRef(false),
    peer = useRef<PeerSession | null>(null),
    multiplayerRole = useRef<MultiplayerRole>("solo"),
    guestSnapshotReady = useRef(false),
    networkSnapshotAt = useRef(0),
    lastHudTick = useRef(-1);
  const [ui, setUi] = useState({
    credits: 650,
    alloy: 520,
    intel: 40,
    objectives: 0,
    army: 2,
    upkeep: 0,
    power: 12,
    wave: 0,
    nextWave: 150,
    selected: "No selection",
    message: "Secure your base with Sentry Turrets after your first refinery.",
    over: "",
    production: null as (Production & { building: "hq" | "barracks" }) | null,
    productionBuilding: null as ("hq" | "barracks") | null,
    buildMode: null as ("build-refinery" | "build-barracks" | "build-turret") | null,
    hasHq: true,
    hasBarracks: false,
    barracksBuilding: false,
    selectedBuilding: null as Building["type"] | null,
    selectedConstruction: false,
    hqPacked: false,
    hqRelocation: null as Building["relocation"] | null,
    fortified: false,
    fortifyProduction: null as { elapsed: number; duration: number } | null,
    productionCooldown: 0,
    doctrine: null as Doctrine | null,
    doctrineProduction: null as { type: Doctrine; elapsed: number; duration: number } | null,
    enemyDoctrine: null as Doctrine | null,
    enemyDoctrineKnown: false,
    canClear: false,
    cancelMode: false,
    selectedCombat: 0,
    selectedUnits: 0,
    selectedWorkers: 0,
    selectedUnitType: null as Unit["type"] | "mixed" | null,
    selectedStance: null as Unit["stance"] | "mixed" | null,
    autoRepair: false,
    repairingWorkers: 0,
  });
  const [saveStatus, setSaveStatus] = useState("AUTOSAVE ON");
  const [moveChooser, setMoveChooser] = useState<{
    x: number;
    y: number;
    world: P;
    choice: "engage" | "direct" | null;
  } | null>(null);
  const [paused, setPaused] = useState(false);
  const [homeOpen, setHomeOpen] = useState(true);
  const [commandProfile, setCommandProfile] = useState<CommandProfile>({ xp: 0, spentPoints: 0, lastAward: 0 });
  const [hasAutosave, setHasAutosave] = useState(false);
  const [newMatchFog, setNewMatchFog] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [network, setNetwork] = useState<{
    role: MultiplayerRole;
    status: PeerStatus;
    code: string;
    detail: string;
  }>({ role: "solo", status: "idle", code: "", detail: "" });
  const [commandTab, setCommandTab] = useState<"buildings" | "units" | "tech">(
    "units",
  );
  const commandSelection = useRef("");
  const [tutorialsEnabled, setTutorialsEnabled] = useState(true);
  const [dismissedTips, setDismissedTips] = useState<string[]>([]);
  const pausedRef = useRef(true);
  const lastCountdown = useRef(90);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommandProfile(readCommandProfile());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = (
      key: "terrain" | "units" | "workerDirections" | "workerWalk" | "workerWalkC" | "trooperDirections" | "trooperWalk" | "trooperWalkC" | "tankDirections" | "tankMove" | "tankMoveC" | "droneDirections" | "droneMove" | "trooperFire" | "tankFire" | "workerMine" | "turretDirections" | "turretFire" | "buildings" | "crystal" | "tacticalPlateau" | "commandCrawler",
      src: string,
    ) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (!active) return;
        art.current[key] = image;
        if (key === "terrain") {
          const layer = document.createElement("canvas");
          layer.width = W;
          layer.height = H;
          const ctx = layer.getContext("2d")!;
          ctx.fillStyle = "#101b1b";
          ctx.fillRect(0, 0, W, H);
          const tile = 768;
          for (let py = 0, row = 0; py < H; py += tile, row++)
            for (let px = 0, col = 0; px < W; px += tile, col++) {
              ctx.save();
              ctx.translate(px + tile / 2, py + tile / 2);
              ctx.rotate(((row + col) % 4) * Math.PI / 2);
              ctx.drawImage(image, -tile / 2, -tile / 2, tile, tile);
              ctx.restore();
            }
          ctx.fillStyle = "rgba(2, 10, 11, .16)";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "rgba(14, 52, 51, .18)";
          ctx.fillRect(0, 0, 680, H);
          ctx.fillStyle = "rgba(78, 25, 32, .12)";
          ctx.fillRect(W - 680, 0, 680, H);
          ctx.fillStyle = "rgba(3, 10, 11, .14)";
          ctx.fillRect(680, 0, W - 1360, H);
          art.current.terrainLayer = layer;
        }
      };
      image.src = src;
    };
    load("terrain", "/game-art/frontier-terrain-v1.webp");
    load("units", "/game-art/frontier-units-atlas-v1.png");
    load("workerDirections", "/game-art/frontier-worker-directions-v2.png");
    load("workerWalk", "/game-art/frontier-worker-walk-b-v3.png");
    load("workerWalkC", "/game-art/frontier-worker-walk-c-v4.png");
    load("trooperDirections", "/game-art/frontier-trooper-directions-v2.png");
    load("trooperWalk", "/game-art/frontier-trooper-walk-b-v3.png");
    load("trooperWalkC", "/game-art/frontier-trooper-walk-c-v4.png");
    load("tankDirections", "/game-art/frontier-tank-directions-v2.png");
    load("tankMove", "/game-art/frontier-tank-move-b-v3.png");
    load("tankMoveC", "/game-art/frontier-tank-move-c-v4.png");
    load("droneDirections", "/game-art/frontier-strike-drone-directions-v1.png");
    load("droneMove", "/game-art/frontier-strike-drone-move-b-v2.png");
    load("trooperFire", "/game-art/frontier-trooper-fire-v1.png");
    load("tankFire", "/game-art/frontier-tank-fire-v1.png");
    load("workerMine", "/game-art/frontier-worker-mine-v1.png");
    load("turretDirections", "/game-art/frontier-turret-directions-v1.png");
    load("turretFire", "/game-art/frontier-turret-fire-v1.png");
    load("buildings", "/game-art/frontier-buildings-atlas-v1.png");
    load("crystal", "/game-art/frontier-crystal-v1.png");
    load("tacticalPlateau", "/game-art/frontier-tactical-plateau-v1.png");
    load("commandCrawler", "/game-art/frontier-command-crawler-v1.png");
    return () => {
      active = false;
    };
  }, []);
  const resize = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const d = devicePixelRatio || 1,
      r = c.getBoundingClientRect();
    c.width = r.width * d;
    c.height = r.height * d;
    c.getContext("2d")?.setTransform(d, 0, 0, d, 0, 0);
  }, []);
  const screenToWorld = (sx: number, sy: number) => {
    const c = canvas.current!,
      g = game.current;
    return {
      x: (sx - c.clientWidth / 2) / g.zoom + g.camera.x,
      y: (sy - c.clientHeight / 2) / g.zoom + g.camera.y,
    };
  };
  const moveCameraTo = (x: number, y: number) => {
    const c = canvas.current;
    if (!c) return;
    const g = game.current;
    const halfW = c.clientWidth / (2 * g.zoom);
    const halfH = c.clientHeight / (2 * g.zoom);
    g.camera.x = Math.max(halfW, Math.min(W - halfW, x));
    g.camera.y = Math.max(halfH, Math.min(H - halfH, y));
  };
  const sync = () => {
    const g = game.current,
      chosen = [...g.units, ...g.buildings].filter((o) =>
        g.selected.includes(o.id),
      );
    const selectionKey = g.selected.join(",");
    if (selectionKey !== commandSelection.current) {
      commandSelection.current = selectionKey;
      setCommandTab("units");
    }
    const chosenUnits = chosen.filter(isUnit);
    const chosenTypes = [...new Set(chosenUnits.map((unit) => unit.type))];
    const chosenStances = [...new Set(chosenUnits
      .filter((unit) => unit.type !== "worker" || unit.autoRepair)
      .map((unit) => unit.stance || "pursue"))];
    const one = chosen[0],
      rank =
        one && isUnit(one)
          ? ` · RANK ${one.level || 1} · ${one.xp || 0} XP`
          : "";
    const selectedBuilding = g.buildings.find(
      (b) => b.team === "player" && g.selected.includes(b.id),
    );
    const playerBarracks = g.buildings.filter(
      (b) => b.team === "player" && b.type === "barracks",
    );
    setUi({
      credits: Math.floor(g.credits),
      alloy: Math.floor(g.alloy),
      intel: Math.floor(g.intel),
      objectives: (g.objectives || []).filter((objective) => objective.owner === "player").length,
      army: g.units.filter((unit) => unit.team === "player" && unit.type !== "worker").length,
      upkeep: upkeepPerSecond(g.units.filter((unit) => unit.team === "player" && unit.type !== "worker").length) * 60,
      power: g.power,
      wave: g.wave,
      nextWave: Math.max(0, Math.ceil(g.aiAttackAt - g.time)),
      selected: chosen.length
        ? chosen.length === 1
          ? isUnit(one)
            ? `${unitName(one.type)} · ${Math.ceil(one.hp)}/${Math.ceil(one.max)} HP · ${Math.round(stats[one.type].damage * (1 + ((one.level || 1) - 1) * 0.18))} DMG · ${unitDuty(one)} · ${(one.supply ?? SUPPLY_CAPACITY) > 0 ? `SUPPLY ${Math.ceil(one.supply ?? SUPPLY_CAPACITY)}s` : "OUT OF SUPPLY −25%"}${(one.level || 1) > 1 ? ` · REGEN ${(veteranRegenRate(one) * 100).toFixed(0)}% HP/s` : ""}${one.retreating ? " · RETREATING" : ""}${rank}`
            : (one.progress ?? 1) < 1
              ? `${one.type.toUpperCase()} WIREFRAME · ${one.constructionStarted ? `${Math.round((one.progress || 0) * 100)}% BUILT` : "WAITING FOR WORKER"}`
              : `${one.type === "turret" ? "SENTRY TURRET · 210 RANGE · 12 DMG" : one.type === "hq" && one.packed ? "COMMAND CRAWLER" : one.type.toUpperCase()} · ${Math.ceil(one.hp)}/${Math.ceil(one.max)} HP${one.type === "hq" && one.relocation ? ` · ${one.relocation.mode === "pack" ? "PACKING" : "DEPLOYING"} ${Math.round(one.relocation.elapsed / one.relocation.duration * 100)}%` : one.type === "hq" && one.packed ? " · MOBILE · SYSTEMS OFFLINE" : one.type === "hq" && g.fortified ? " · FORTIFIED" : ""}`
          : `${chosen.length} UNITS SELECTED`
        : "No selection",
      message: g.message,
      over: g.over,
      production: selectedBuilding?.production
        ? {
            ...selectedBuilding.production,
            building: selectedBuilding.type as "hq" | "barracks",
          }
        : null,
      productionCooldown: selectedBuilding?.cooldown || 0,
      productionBuilding:
        selectedBuilding &&
        ["hq", "barracks"].includes(selectedBuilding.type) &&
        buildingOperational(selectedBuilding)
          ? (selectedBuilding.type as "hq" | "barracks")
          : null,
      hasHq: g.buildings.some((b) => b.team === "player" && b.type === "hq"),
      hasBarracks: playerBarracks.some(
        (b) => b.progress === undefined || b.progress >= 1,
      ),
      barracksBuilding: playerBarracks.some(
        (b) => b.progress !== undefined && b.progress < 1,
      ),
      buildMode: g.mode.startsWith("build")
        ? (g.mode as "build-refinery" | "build-barracks" | "build-turret")
        : null,
      selectedBuilding: selectedBuilding?.type || null,
      selectedConstruction: Boolean(selectedBuilding && (selectedBuilding.progress ?? 1) < 1),
      hqPacked: Boolean(selectedBuilding?.type === "hq" && selectedBuilding.packed),
      hqRelocation: selectedBuilding?.type === "hq" && selectedBuilding.relocation ? { ...selectedBuilding.relocation } : null,
      fortified: Boolean(g.fortified),
      fortifyProduction: g.fortifyProduction || null,
      doctrine: g.doctrine || null,
      doctrineProduction: g.doctrineProduction || null,
      enemyDoctrine: g.scoutedEnemyDoctrine === "air" || g.scoutedEnemyDoctrine === "armor" ? g.scoutedEnemyDoctrine : null,
      enemyDoctrineKnown: Boolean(g.enemyDoctrineKnown),
      canClear: chosen.length > 0 || g.mode !== "select",
      cancelMode: g.mode !== "select",
      selectedCombat: chosen.filter((object) => isUnit(object) && object.type !== "worker").length,
      selectedUnits: chosenUnits.length,
      selectedWorkers: chosenUnits.filter((unit) => unit.type === "worker").length,
      selectedUnitType: chosenTypes.length === 1 ? chosenTypes[0] : chosenTypes.length ? "mixed" : null,
      selectedStance: chosenStances.length === 1 ? chosenStances[0] : chosenStances.length ? "mixed" : null,
      autoRepair: chosenUnits.some((unit) => unit.type === "worker") && chosenUnits.filter((unit) => unit.type === "worker").every((unit) => unit.autoRepair),
      repairingWorkers: chosenUnits.filter((unit) => unit.type === "worker" && unit.repairTarget).length,
    });
  };

  const peerSend = (message: unknown) => peer.current?.send(message);

  function applyRemotePoint(payload: Record<string, unknown>) {
    const g = game.current;
    const wx = Number(payload.x), wy = Number(payload.y);
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    const selectedIds = Array.isArray(payload.selected)
      ? payload.selected.filter((id): id is number => Number.isInteger(id))
      : [];
    const mode = typeof payload.mode === "string" ? payload.mode : "select";
    if (mode === "move-hq") {
      const hq = g.buildings.find((building) =>
        building.team === "enemy" && building.type === "hq" && building.packed && selectedIds.includes(building.id));
      if (hq) {
        hq.mobileTarget = { x: Math.max(80, Math.min(W - 80, wx)), y: Math.max(80, Math.min(H - 80, wy)) };
        hq.mobileFacing = Math.atan2(wy - hq.y, wx - hq.x);
      }
      return;
    }
    if (mode === "set-rally") {
      const building = g.buildings.find((b) =>
        b.team === "enemy" && selectedIds.includes(b.id) && ["hq", "barracks"].includes(b.type) && buildingOperational(b));
      if (building) building.rally = { x: Math.max(30, Math.min(W - 30, wx)), y: Math.max(30, Math.min(H - 30, wy)) };
      return;
    }
    const remoteUnits = g.units.filter((unit) => unit.team === "enemy" && selectedIds.includes(unit.id));
    if (mode === "repair") {
      const workers = remoteUnits.filter((unit) => unit.type === "worker");
      const repairable = [...g.buildings, ...g.units]
        .filter((object) => object.team === "enemy" && object.hp > 0 && object.hp < object.max && (isUnit(object) || buildingOperational(object)))
        .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
      if (repairable && Math.hypot(repairable.x - wx, repairable.y - wy) < 70) {
        workers.filter((worker) => worker.id !== repairable.id).forEach((worker) => {
          clearWorkerConstruction(worker, "repair");
          worker.repairTarget = repairable.id;
          worker.workerMode = "repair";
          worker.target = undefined;
          worker.enemy = undefined;
          worker.nav = undefined;
        });
      }
      return;
    }
    if (mode === "set-patrol-a" || mode === "set-patrol-b") {
      const patrollers = remoteUnits.filter((unit) => unit.type !== "worker" || unit.autoRepair);
      if (mode === "set-patrol-a") {
        patrollers.forEach((unit) => { unit.patrol = { a: { x: wx, y: wy }, b: { x: wx, y: wy }, next: "a" }; });
      } else {
        patrollers.forEach((unit, index) => {
          const a = unit.patrol?.a || { x: unit.x, y: unit.y };
          unit.patrol = { a, b: { x: wx, y: wy }, next: "b" };
          unit.stance = "patrol";
          if (unit.type === "worker") unit.workerMode = "hold";
          unit.retreating = false;
          unit.moveEngage = false;
          unit.enemy = undefined;
          unit.target = { x: a.x + (index % 3) * 22, y: a.y + Math.floor(index / 3) * 22 };
          unit.nav = undefined;
        });
      }
      return;
    }
    if (mode.startsWith("build-")) {
      const type = mode === "build-refinery" ? "refinery" : mode === "build-barracks" ? "barracks" : mode === "build-turret" ? "turret" : null;
      if (!type) return;
      const cost = BUILD_COST[type];
      const radius = buildingStats[type].r;
      const blocked =
        g.buildings.some((b) => Math.hypot(b.x - wx, b.y - wy) < buildingStats[b.type].r + radius + 18) ||
        g.crystals.some((crystal) => crystal.amount > 0 && Math.hypot(crystal.x - wx, crystal.y - wy) < radius + 36) ||
        TERRAIN_RIDGES.some((ridge) => Math.hypot(ridge.x - wx, ridge.y - wy) < ridge.r + radius + 18) ||
        wx < radius + 20 || wx > W - radius - 20 || wy < radius + 20 || wy > H - radius - 20;
      if (blocked || g.enemyAlloy < cost) return;
      g.enemyAlloy -= cost;
      const buildingId = g.nextId++;
      g.buildings.push({
        id: buildingId, team: "enemy", type, x: wx, y: wy, hp: 1,
        max: buildingHealth[type], progress: 0, constructionDuration: buildingBuildTime[type], constructionStarted: false,
      });
      remoteUnits.filter((unit) => unit.type === "worker").forEach((worker) => {
        queueWorkerConstruction(worker, buildingId);
      });
      return;
    }
    const units = remoteUnits;
    if (!units.length) return;
    const remoteWorkers = units.filter((unit) => unit.type === "worker");
    const friendlyRepairable = [...g.buildings, ...g.units]
      .filter((object) => object.team === "enemy" && object.hp > 0 && object.hp < object.max && (isUnit(object) || buildingOperational(object)))
      .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
    if (remoteWorkers.length === units.length && friendlyRepairable && Math.hypot(friendlyRepairable.x - wx, friendlyRepairable.y - wy) < 65) {
      remoteWorkers.filter((worker) => worker.id !== friendlyRepairable.id).forEach((worker) => {
        clearWorkerConstruction(worker, "repair");
        worker.repairTarget = friendlyRepairable.id;
        worker.workerMode = "repair";
        worker.target = undefined;
        worker.enemy = undefined;
        worker.nav = undefined;
      });
      return;
    }
    const victim = [...g.units, ...g.buildings]
      .filter((object) => object.team === "player" && isVisibleFor(g, "enemy", object, objectRadius(object)))
      .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
    const forcedTravel = mode === "move" || mode === "move-engage";
    const attacking = !forcedTravel && Boolean(victim && Math.hypot(victim.x - wx, victim.y - wy) < 65);
    for (const [index, unit] of units.entries()) {
      if (attacking) {
        unit.enemy = victim!.id;
        unit.target = undefined;
        unit.moveEngage = false;
      } else {
        unit.enemy = undefined;
        unit.target = { x: wx + (index % 3) * 26, y: wy + Math.floor(index / 3) * 26 };
        unit.moveEngage = unit.type !== "worker" && mode === "move-engage";
        if (unit.moveEngage) unit.stance = "pursue";
      }
      unit.retreating = false;
      unit.repairTarget = undefined;
      if (unit.type === "worker") {
        clearWorkerConstruction(unit, "hold");
      }
      unit.patrol = undefined;
      if (unit.stance === "patrol" || (forcedTravel && unit.stance === "hold")) unit.stance = "pursue";
      unit.nav = undefined;
    }
  }

  function applyRemoteAction(payload: Record<string, unknown>) {
    const g = game.current;
    const name = typeof payload.name === "string" ? payload.name : "";
    const selectedIds = Array.isArray(payload.selected)
      ? payload.selected.filter((id): id is number => Number.isInteger(id))
      : [];
    let building = g.buildings.find((b) => b.team === "enemy" && selectedIds.includes(b.id));
    if (name === "cancel-construction") {
      if (!building || (building.progress ?? 1) >= 1) return;
      const refund = building.constructionStarted ? Math.floor(BUILD_COST[building.type] / 2) : BUILD_COST[building.type];
      g.enemyAlloy += refund;
      const cancelledId = building.id;
      g.buildings = g.buildings.filter((candidate) => candidate.id !== cancelledId);
      for (const worker of g.units.filter((unit) => unit.team === "enemy" && unit.type === "worker")) {
        const queue = (worker.buildQueue || (worker.buildTarget ? [worker.buildTarget] : [])).filter((id) => id !== cancelledId);
        worker.buildQueue = queue;
        worker.buildTarget = queue[0];
        if (!queue.length && worker.workerMode === "construct") worker.workerMode = "mine";
        worker.nav = undefined;
      }
      return;
    }
    if (name === "sell") {
      if (!building || building.type === "hq") return;
      const refund = Math.floor(BUILD_COST[building.type] / 2);
      g.enemyAlloy += refund;
      if (building.progress === 1 && building.type !== "turret")
        g.enemyPower = Math.max(0, (g.enemyPower ?? 12) - (building.type === "refinery" ? 4 : 2));
      g.buildings = g.buildings.filter((candidate) => candidate.id !== building!.id);
      return;
    }
    if (name === "fortify") {
      if (!building || building.type !== "hq" || !buildingOperational(building) || g.enemyFortified || g.enemyFortifyProduction || g.enemyDoctrineProduction || g.enemyIntel < FORTIFY_INTEL_COST || building.production) return;
      g.enemyIntel -= FORTIFY_INTEL_COST;
      g.enemyFortifyProduction = { elapsed: 0, duration: FORTIFY_DURATION };
      return;
    }
    if (name === "doctrine-air" || name === "doctrine-armor") {
      const doctrine: Doctrine = name === "doctrine-air" ? "air" : "armor";
      if (!building || building.type !== "hq" || !buildingOperational(building) || g.enemyDoctrine || g.enemyDoctrineProduction || g.enemyFortifyProduction || g.enemyIntel < DOCTRINE_INTEL_COST || building.production) return;
      g.enemyIntel -= DOCTRINE_INTEL_COST;
      g.enemyDoctrineProduction = { type: doctrine, elapsed: 0, duration: DOCTRINE_DURATION };
      return;
    }
    if (name === "retreat") {
      const hq = g.buildings.find((building) => building.team === "enemy" && building.type === "hq" && buildingOperational(building));
      const units = g.units.filter((unit) => unit.team === "enemy" && selectedIds.includes(unit.id) && unit.type !== "worker");
      if (!hq || !units.length) return;
      units.forEach((unit, index) => {
        unit.enemy = undefined;
        unit.nav = undefined;
        unit.retreating = true;
        unit.moveEngage = false;
        unit.target = { x: hq.x + (index % 3) * 28 - 28, y: hq.y + 95 + Math.floor(index / 3) * 24 };
      });
      return;
    }
    if (name === "pack-hq" || name === "deploy-hq") {
      const hq = g.buildings.find((candidate) =>
        candidate.team === "enemy" && candidate.type === "hq" && selectedIds.includes(candidate.id));
      if (!hq || hq.production || g.enemyFortifyProduction || g.enemyDoctrineProduction || hq.relocation) return;
      if (name === "pack-hq" && !hq.packed) hq.relocation = { mode: "pack", elapsed: 0, duration: 5 };
      if (name === "deploy-hq" && hq.packed) {
        if (hqBlockedAt(g, hq, hq.x, hq.y, true)) return;
        hq.mobileTarget = undefined;
        hq.relocation = { mode: "deploy", elapsed: 0, duration: 6 };
      }
      return;
    }
    const selectedUnits = g.units.filter((unit) => unit.team === "enemy" && selectedIds.includes(unit.id));
    if (name === "auto-repair") {
      const workers = selectedUnits.filter((unit) => unit.type === "worker");
      const enable = workers.some((worker) => !worker.autoRepair);
      workers.forEach((worker) => {
        worker.autoRepair = enable;
        clearWorkerConstruction(worker, enable ? "hold" : "mine");
        worker.repairTarget = undefined;
        worker.enemy = undefined;
        worker.target = undefined;
        worker.nav = undefined;
        if (!enable) {
          worker.patrol = undefined;
          if (worker.stance === "patrol") worker.stance = "pursue";
        }
      });
      return;
    }
    if (name === "repair" || name === "patrol" || name === "move" || name === "move-engage" || name === "move-hq") return;
    if (name === "hold" || name === "pursue") {
      selectedUnits.filter((unit) => unit.type !== "worker").forEach((unit) => {
        unit.stance = name;
        unit.retreating = false;
        unit.moveEngage = false;
        unit.patrol = undefined;
        if (name === "hold") {
          unit.target = undefined;
          unit.enemy = undefined;
          unit.nav = undefined;
        }
      });
      return;
    }
    const type = name as Unit["type"];
    if (!["worker", "trooper", "tank", "drone"].includes(type)) return;
    const wanted = type === "worker" ? "hq" : "barracks";
    building = g.buildings.find((b) =>
      b.team === "enemy" && selectedIds.includes(b.id) && b.type === wanted && buildingOperational(b));
    if (!building || (type === "worker" && (g.enemyFortifyProduction || g.enemyDoctrineProduction))) return;
    if (!building.production && (building.cooldown || 0) > 0) return;
    const pending = (building.production?.queue?.length || 0) + (building.production ? 1 : 0);
    if (pending >= MAX_QUEUE || g.enemyCredits < unitCost[type]) return;
    g.enemyCredits -= unitCost[type];
    if (!building.production) {
      building.production = { type, elapsed: 0, duration: productionDurationFor(g, "enemy", type), queue: [] };
    } else {
      building.production.queue = [...(building.production.queue || []), type];
    }
  }

  function sendGuestPoint(wx: number, wy: number) {
    const g = game.current;
    if (g.over) return;
    const mode = g.mode;
    peerSend({ type: "command", kind: "point", x: wx, y: wy, mode, selected: g.selected });
    if (mode === "set-patrol-a") {
      g.mode = "set-patrol-b";
      g.message = "PATROL: now choose the second patrol point.";
    } else {
      if (mode !== "select" && !mode.startsWith("build-")) g.mode = "select";
      g.message = mode.startsWith("build-")
        ? "Construction queued. Tap another site or press Cancel."
          : mode === "set-rally" ? "Rally point transmitted."
          : mode === "move-hq" ? "Command Crawler destination transmitted."
          : mode === "move-engage" ? "Move + Engage transmitted — destination remains locked."
            : mode === "move" ? "Direct Move transmitted — units will ignore threats."
              : "Order transmitted.";
    }
    sync();
  }

  function guestAction(name: string) {
    const g = game.current;
    if (name === "deselect") {
      g.selected = [];
      g.mode = "select";
      g.message = "Selection cleared.";
      sync();
      return;
    }
    if (name.startsWith("build-")) {
      const hasWorker = g.units.some((unit) =>
        unit.team === "player" && unit.type === "worker" && g.selected.includes(unit.id));
      if (!hasWorker) {
        g.message = "Select a Worker, then open Construction.";
        sync();
        return;
      }
      g.mode = name as Game["mode"];
      g.message = `${name.replace("build-", "").toUpperCase()} PLACEMENT: choose a clear location.`;
      sync();
      return;
    }
    if (name === "rally") {
      const building = g.buildings.find((b) => b.team === "player" && g.selected.includes(b.id) && ["hq", "barracks"].includes(b.type));
      if (!building || !buildingOperational(building)) {
        g.message = "Select your HQ or a Barracks first.";
      } else {
        g.mode = "set-rally";
        g.message = "RALLY POINT: choose a location.";
      }
      sync();
      return;
    }
    if (name === "move-hq") {
      const hq = g.buildings.find((building) =>
        building.team === "player" && building.type === "hq" && building.packed && g.selected.includes(building.id));
      if (!hq) g.message = "Pack and select your Headquarters before moving it.";
      else {
        g.mode = "move-hq";
        g.message = "COMMAND CRAWLER: choose a destination. It moves extremely slowly.";
      }
      sync();
      return;
    }
    if (name === "move" || name === "move-engage" || name === "repair" || name === "patrol") {
      const wantedMode: Game["mode"] = name === "move" || name === "move-engage" ? name : name === "repair" ? "repair" : "set-patrol-a";
      g.mode = wantedMode;
      g.message = name === "move" || name === "move-engage"
        ? `${name === "move-engage" ? "MOVE + ENGAGE" : "DIRECT MOVE"}: choose a destination.`
        : name === "repair"
          ? "REPAIR ORDER: choose a damaged friendly unit or structure."
          : "PATROL: choose the first patrol point.";
      sync();
      return;
    }
    if (name === "reset") return;
    peerSend({ type: "command", kind: "action", name, selected: g.selected });
    g.message = `${name.toUpperCase()} order transmitted.`;
    sync();
  }

  function handlePeerMessage(message: unknown) {
    if (!message || typeof message !== "object") return;
    const payload = message as Record<string, unknown>;
    if (multiplayerRole.current === "host" && payload.type === "command") {
      if (payload.kind === "point") applyRemotePoint(payload);
      if (payload.kind === "action") applyRemoteAction(payload);
      sync();
      return;
    }
    if (multiplayerRole.current === "guest" && payload.type === "state" && payload.game) {
      const first = !guestSnapshotReady.current;
      game.current = guestPerspective(payload.game as Game, first ? null : game.current, first);
      guestSnapshotReady.current = true;
      setHomeOpen(false);
      pausedRef.current = false;
      setPaused(false);
      sync();
    }
  }

  function peerHandlers(role: "host" | "guest") {
    return {
      onOpen: () => {
        setNetwork((current) => ({ ...current, role, status: "connected", detail: "Private link established." }));
        if (role === "host") {
          game.current = initialMultiplayer({ fogEnabled: newMatchFog });
          multiplayerRole.current = "host";
          matchStarted.current = false;
          setHomeOpen(false);
          setPause(false);
          sync();
          window.setTimeout(() => peerSend({ type: "state", game: game.current }), 40);
        }
      },
      onMessage: handlePeerMessage,
      onStatus: (status: PeerStatus, detail = "") => {
        setNetwork((current) => ({ ...current, role, status, detail }));
      },
    };
  }

  async function createPrivateMatch() {
    peer.current?.close();
    multiplayerRole.current = "host";
    guestSnapshotReady.current = false;
    setNetwork({ role: "host", status: "creating", code: "", detail: "Preparing a private room…" });
    try {
      const session = await hostRoom(newMatchFog, peerHandlers("host"));
      peer.current = session;
      setNetwork((current) => ({ ...current, role: "host", code: session.code, status: current.status === "creating" ? "waiting" : current.status }));
    } catch (error) {
      multiplayerRole.current = "solo";
      setNetwork({ role: "solo", status: "error", code: "", detail: error instanceof Error ? error.message : "Could not create the room." });
    }
  }

  async function joinPrivateMatch() {
    if (!/^[A-Z2-9]{6}$/.test(joinCode.trim().toUpperCase())) {
      setNetwork({ role: "solo", status: "error", code: "", detail: "Enter the six-character room code." });
      return;
    }
    peer.current?.close();
    multiplayerRole.current = "guest";
    guestSnapshotReady.current = false;
    const code = joinCode.trim().toUpperCase();
    setNetwork({ role: "guest", status: "joining", code, detail: "Finding the private room…" });
    try {
      const joined = await joinRoom(code, peerHandlers("guest"));
      peer.current = joined.session;
      setNewMatchFog(joined.fogEnabled);
      setNetwork((current) => ({ ...current, role: "guest", code }));
    } catch (error) {
      multiplayerRole.current = "solo";
      setNetwork({ role: "solo", status: "error", code, detail: error instanceof Error ? error.message : "Could not join the room." });
    }
  }

  function leaveMultiplayer() {
    peer.current?.close();
    peer.current = null;
    multiplayerRole.current = "solo";
    guestSnapshotReady.current = false;
    setNetwork({ role: "solo", status: "idle", code: "", detail: "" });
  }

  const command = (wx: number, wy: number) => {
    const g = game.current;
    if (g.over) return;
    if (multiplayerRole.current === "guest") {
      sendGuestPoint(wx, wy);
      return;
    }
    if (g.mode === "move-hq") {
      const hq = g.buildings.find((building) =>
        building.team === "player" && building.type === "hq" && building.packed && g.selected.includes(building.id));
      if (!hq || hq.relocation) {
        g.mode = "select";
        g.message = "Crawler move canceled — select a fully packed Headquarters.";
      } else {
        hq.mobileTarget = { x: Math.max(80, Math.min(W - 80, wx)), y: Math.max(80, Math.min(H - 80, wy)) };
        hq.mobileFacing = Math.atan2(wy - hq.y, wx - hq.x);
        g.mode = "select";
        g.matchStats.meaningfulActions++;
        g.matchStats.orders++;
        g.message = "COMMAND CRAWLER moving — extremely slow; production, supply, and research remain offline.";
      }
      sync();
      return;
    }
    if (g.mode === "set-rally") {
      const b = g.buildings.find(
        (x) =>
          x.team === "player" &&
          g.selected.includes(x.id) &&
          ["hq", "barracks"].includes(x.type) &&
          buildingOperational(x),
      );
      if (!b) {
        g.mode = "select";
        g.message =
          "Rally point canceled — select a production building first.";
        sync();
        return;
      }
      b.rally = {
        x: Math.max(30, Math.min(W - 30, wx)),
        y: Math.max(30, Math.min(H - 30, wy)),
      };
      g.mode = "select";
      g.matchStats.meaningfulActions++;
      g.matchStats.orders++;
      g.message = `${b.type.toUpperCase()} rally point set.`;
      sync();
      return;
    }
    const selectedWorkers = g.units.filter((unit) => unit.team === "player" && unit.type === "worker" && g.selected.includes(unit.id));
    const selectedCombat = g.units.filter((unit) => unit.team === "player" && unit.type !== "worker" && g.selected.includes(unit.id));
    const selectedPatrollers = [...selectedCombat, ...selectedWorkers.filter((worker) => worker.autoRepair)];
    if (g.mode === "repair") {
      const repairable = [...g.buildings, ...g.units]
        .filter((object) => object.team === "player" && object.hp > 0 && object.hp < object.max && (isUnit(object) || buildingOperational(object)))
        .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
      if (!repairable || Math.hypot(repairable.x - wx, repairable.y - wy) >= 70) {
        g.message = "REPAIR ORDER: choose a damaged friendly unit or structure.";
        sync();
        return;
      }
      const assignedWorkers = selectedWorkers.filter((worker) => worker.id !== repairable.id);
      assignedWorkers.forEach((worker) => {
        clearWorkerConstruction(worker, "repair");
        worker.repairTarget = repairable.id;
        worker.workerMode = "repair";
        worker.target = undefined;
        worker.enemy = undefined;
        worker.nav = undefined;
      });
      g.mode = "select";
      g.matchStats.meaningfulActions++;
      g.matchStats.orders++;
      g.message = assignedWorkers.length
        ? `${assignedWorkers.length} Worker${assignedWorkers.length === 1 ? "" : "s"} repairing ${isUnit(repairable) ? unitName(repairable.type) : repairable.type.toUpperCase()} · repairs consume alloy.`
        : "A Worker cannot repair itself — assign another Worker.";
      sync();
      return;
    }
    if (g.mode === "set-patrol-a") {
      selectedPatrollers.forEach((unit) => {
        unit.patrol = { a: { x: wx, y: wy }, b: { x: wx, y: wy }, next: "a" };
      });
      g.mode = "set-patrol-b";
      g.message = "PATROL: now choose the second patrol point.";
      sync();
      return;
    }
    if (g.mode === "set-patrol-b") {
      selectedPatrollers.forEach((unit, index) => {
        const a = unit.patrol?.a || { x: unit.x, y: unit.y };
        unit.patrol = { a, b: { x: wx, y: wy }, next: "b" };
        unit.stance = "patrol";
        if (unit.type === "worker") unit.workerMode = "hold";
        unit.retreating = false;
        unit.moveEngage = false;
        unit.enemy = undefined;
        unit.target = { x: a.x + (index % 3) * 22, y: a.y + Math.floor(index / 3) * 22 };
        unit.nav = undefined;
      });
      g.mode = "select";
      g.matchStats.meaningfulActions++;
      g.matchStats.orders++;
      g.message = selectedPatrollers.some((unit) => unit.type === "worker")
        ? "MAINTENANCE PATROL ACTIVE — Workers repair nearby allies, then resume their route."
        : "PATROL ROUTE ACTIVE — units engage threats, then resume their route.";
      sync();
      return;
    }
    if (g.mode.startsWith("build")) {
      const type = g.mode === "build-refinery" ? "refinery" : g.mode === "build-barracks" ? "barracks" : "turret",
        cost = BUILD_COST[type],
        r = buildingStats[type].r;
      const blocked =
        g.buildings.some(
          (b) =>
            Math.hypot(b.x - wx, b.y - wy) < buildingStats[b.type].r + r + 18,
        ) ||
        g.crystals.some(
          (c) => c.amount > 0 && Math.hypot(c.x - wx, c.y - wy) < r + 36,
        ) ||
        TERRAIN_RIDGES.some((ridge) => Math.hypot(ridge.x - wx, ridge.y - wy) < ridge.r + r + 18) ||
        wx < r + 20 ||
        wx > W - r - 20 ||
        wy < r + 20 ||
        wy > H - r - 20;
      if (blocked) {
        g.message = "Can't build there — choose a clear location.";
        sync();
        return;
      }
      if (g.alloy < cost) {
        g.message = "Insufficient alloy.";
        sync();
        return;
      }
      g.alloy -= cost;
      g.matchStats.totalCreditsSpent += cost;
      g.matchStats.meaningfulActions++;
      const buildingId = g.nextId++;
      g.buildings.push({
        id: buildingId,
        team: "player",
        type,
        x: wx,
        y: wy,
        hp: 1,
        max: buildingHealth[type],
        progress: 0,
        constructionDuration: buildingBuildTime[type],
        constructionStarted: false,
      });
      selectedWorkers.forEach((worker) => {
        queueWorkerConstruction(worker, buildingId);
      });
      g.message = `${type.toUpperCase()} queued — assigned Worker${selectedWorkers.length === 1 ? "" : "s"} will build it in order. Tap another site or press Cancel.`;
      sync();
      return;
    }
    const ours = g.units.filter((u) => g.selected.includes(u.id));
    if (!ours.length) return;
    const friendlyRepairable = [...g.buildings, ...g.units]
      .filter((object) => object.team === "player" && object.hp > 0 && object.hp < object.max && (isUnit(object) || buildingOperational(object)))
      .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
    if (
      selectedWorkers.length === ours.length &&
      friendlyRepairable &&
      Math.hypot(friendlyRepairable.x - wx, friendlyRepairable.y - wy) < 65
    ) {
      const assignedWorkers = selectedWorkers.filter((worker) => worker.id !== friendlyRepairable.id);
      assignedWorkers.forEach((worker) => {
        clearWorkerConstruction(worker, "repair");
        worker.repairTarget = friendlyRepairable.id;
        worker.workerMode = "repair";
        worker.target = undefined;
        worker.enemy = undefined;
        worker.nav = undefined;
      });
      g.message = assignedWorkers.length
        ? `Repair order confirmed for ${isUnit(friendlyRepairable) ? unitName(friendlyRepairable.type) : friendlyRepairable.type.toUpperCase()} · repairs consume alloy.`
        : "A Worker cannot repair itself — assign another Worker.";
      sync();
      return;
    }
    const victim = [...g.units, ...g.buildings]
      .filter((o) => o.team === "enemy" && isVisible(g, o, objectRadius(o)))
      .sort(
        (a, b) =>
          Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy),
      )[0];
    const forcedTravel = g.mode === "move" || g.mode === "move-engage";
    const attacking = !forcedTravel && Boolean(victim && Math.hypot(victim.x - wx, victim.y - wy) < 65);
    if (attacking)
      ours.forEach((u) => {
        u.retreating = false;
        u.enemy = victim!.id;
        u.target = undefined;
        u.moveEngage = false;
        u.nav = undefined;
        u.repairTarget = undefined;
        if (u.type === "worker") {
          clearWorkerConstruction(u, "hold");
        }
        u.patrol = undefined;
        if (u.stance === "patrol" || u.stance === "hold") u.stance = "pursue";
      });
    else
      ours.forEach((u, i) => {
        u.retreating = false;
        u.enemy = undefined;
        u.target = { x: wx + (i % 3) * 26, y: wy + Math.floor(i / 3) * 26 };
        u.moveEngage = u.type !== "worker" && g.mode === "move-engage";
        if (u.moveEngage) u.stance = "pursue";
        u.nav = undefined;
        u.repairTarget = undefined;
        if (u.type === "worker") {
          clearWorkerConstruction(u, "hold");
        }
        u.patrol = undefined;
        if (u.stance === "patrol" || u.stance === "hold") u.stance = "pursue";
      });
    g.matchStats.meaningfulActions++;
    g.matchStats.orders++;
    g.message =
      attacking
        ? "Attack order confirmed."
        : forcedTravel
          ? g.mode === "move-engage" ? "MOVE + ENGAGE — destination locked; units will resume after nearby threats." : "DIRECT MOVE — destination locked; units ignore threats en route."
          : "Moving out.";
    if (forcedTravel) g.mode = "select";
    sync();
  };
  const setPause = (value: boolean) => {
    pausedRef.current = multiplayerRole.current === "solo" ? value : false;
    setPaused(value);
    last.current = performance.now();
  };
  const startNewMatch = (fogEnabled = newMatchFog) => {
    leaveMultiplayer();
    localStorage.removeItem(SAVE_KEY);
    game.current = initial({ fogEnabled });
    lastCountdown.current = Math.max(0, Math.ceil(game.current.aiAttackAt));
    attackTimers.current = {};
    matchStarted.current = true;
    setSaveStatus("NEW MATCH");
    setHasAutosave(true);
    setHomeOpen(false);
    setPause(false);
    sync();
  };
  const continueMatch = () => {
    game.current = loadGame();
    attackTimers.current = {};
    matchStarted.current = true;
    lastCountdown.current = Math.max(0, Math.ceil(game.current.aiAttackAt - game.current.time));
    setHomeOpen(false);
    setPause(false);
    sync();
  };
  const openHome = () => {
    const wasSolo = multiplayerRole.current === "solo";
    if (wasSolo) {
      save();
      setHasAutosave(true);
    } else {
      leaveMultiplayer();
    }
    setPause(false);
    pausedRef.current = true;
    setHomeOpen(true);
  };
  const toggleTutorials = () => {
    const next = !tutorialsEnabled;
    localStorage.setItem(TUTORIALS_KEY, next ? "on" : "off");
    if (next) {
      setDismissedTips([]);
      localStorage.removeItem(DISMISSED_TIPS_KEY);
    }
    setTutorialsEnabled(next);
  };
  const dismissTip = (tip: string) => {
    setDismissedTips((current) => {
      const next = [...new Set([...current, tip])];
      localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify(next));
      return next;
    });
  };
  const save = useCallback(() => {
    if (!matchStarted.current || multiplayerRole.current !== "solo") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.current));
      setSaveStatus("AUTOSAVED");
    } catch {
      setSaveStatus("SAVE FAILED");
    }
  }, []);
  const saveManual = () => {
    try {
      const snapshot = JSON.stringify(game.current);
      localStorage.setItem(MANUAL_SAVE_KEY, snapshot);
      localStorage.setItem(SAVE_KEY, snapshot);
      setSaveStatus("GAME SAVED");
    } catch {
      setSaveStatus("SAVE FAILED");
    }
  };
  const loadManual = () => {
    try {
      const saved = localStorage.getItem(MANUAL_SAVE_KEY);
      if (!saved) {
        setSaveStatus("NO MANUAL SAVE");
        return;
      }
      const parsed = JSON.parse(saved) as Game;
      game.current = hydrateGame(parsed, "Manual save loaded.");
      attackTimers.current = {};
      lastCountdown.current = Math.max(
        0,
        Math.ceil(game.current.aiAttackAt - game.current.time),
      );
      localStorage.setItem(SAVE_KEY, JSON.stringify(game.current));
      setSaveStatus("GAME LOADED");
      setPause(false);
      sync();
    } catch {
      setSaveStatus("LOAD FAILED");
    }
  };
  const action = (name: string) => {
    const g = game.current;
    if (multiplayerRole.current === "guest") {
      guestAction(name);
      return;
    }
    g.matchStats.playerActions++;
    if (name === "deselect") {
      g.selected = [];
      g.mode = "select";
      g.message = "Selection cleared.";
      lastTap.current = null;
      sync();
      return;
    }
    if (name === "reset") {
      localStorage.removeItem(SAVE_KEY);
      setHasAutosave(false);
      game.current = initial({ fogEnabled: g.fogEnabled });
      lastCountdown.current = 240;
      attackTimers.current = {};
      setSaveStatus("NEW MATCH");
      sync();
      return;
    }
    if (name.startsWith("build")) {
      const hasWorker = g.units.some((unit) =>
        unit.team === "player" && unit.type === "worker" && g.selected.includes(unit.id));
      if (!hasWorker) {
        g.message = "Select a Worker, then open Construction.";
        sync();
        return;
      }
      g.mode = name as Game["mode"];
      g.message =
        name === "build-refinery"
          ? "REFINERY PLACEMENT: tap a clear location on the battlefield."
          : name === "build-barracks"
            ? "BARRACKS PLACEMENT: tap a clear location on the battlefield."
            : "SENTRY TURRET PLACEMENT: tap a clear location to cover an approach.";
      sync();
      return;
    }
    let b = g.buildings.find(
      (x) => g.selected.includes(x.id) && x.team === "player",
    );
    if (name === "pack-hq" || name === "deploy-hq" || name === "move-hq") {
      setCommandTab("units");
      if (!b || b.type !== "hq") {
        g.message = "Select your Headquarters first.";
      } else if (name === "move-hq") {
        if (!b.packed || b.relocation) g.message = "Finish packing the Headquarters before moving it.";
        else {
          g.mode = "move-hq";
          g.message = "COMMAND CRAWLER: choose a destination. It moves extremely slowly.";
        }
      } else if (b.relocation) {
        g.message = `${b.relocation.mode === "pack" ? "Packing" : "Deployment"} is already in progress.`;
      } else if (name === "pack-hq") {
        if (b.packed) g.message = "Headquarters is already packed.";
        else if (b.production || g.fortifyProduction || g.doctrineProduction) g.message = "HQ is busy — finish production or research before packing.";
        else {
          b.relocation = { mode: "pack", elapsed: 0, duration: 5 };
          g.matchStats.meaningfulActions++;
          g.message = "PACKING HEADQUARTERS — command systems go offline in 5 seconds.";
        }
      } else if (!b.packed) {
        g.message = "Headquarters is already deployed.";
      } else if (hqBlockedAt(g, b, b.x, b.y, true)) {
        g.message = "DEPLOYMENT BLOCKED — move the crawler to clear level ground away from cliffs, deposits, and structures.";
      } else {
        b.mobileTarget = undefined;
        b.relocation = { mode: "deploy", elapsed: 0, duration: 6 };
        g.matchStats.meaningfulActions++;
        g.message = "DEPLOYING HEADQUARTERS — command systems restore in 6 seconds.";
      }
      sync();
      return;
    }
    if (name === "rally") {
      if (!b || !(["hq", "barracks"] as string[]).includes(b.type) || !buildingOperational(b)) {
        g.message =
          "Select your HQ or a Barracks first, then set its rally point.";
        sync();
        return;
      }
      g.mode = "set-rally";
      g.message = `RALLY POINT: tap where new ${b.type === "hq" ? "Workers" : "combat units"} should go.`;
      sync();
      return;
    }
    if (name === "sell") {
      if (!b || b.type === "hq") {
        g.message =
          "Select a refinery, barracks, or turret first, then tap Sell Selected.";
        sync();
        return;
      }
      const refund = Math.floor(BUILD_COST[b.type] / 2);
      const soldId = b.id;
      g.buildings = g.buildings.filter((x) => x.id !== soldId);
      g.selected = [];
      g.alloy += refund;
      g.matchStats.meaningfulActions++;
      if (b.progress === 1 && b.type !== "turret")
        g.power = Math.max(0, g.power - (b.type === "refinery" ? 4 : 2));
      g.message = `${b.type} sold for ${refund} alloy.`;
      sync();
      return;
    }
    if (name === "cancel-construction") {
      if (!b || (b.progress ?? 1) >= 1) {
        g.message = "Select an unfinished construction wireframe first.";
        sync();
        return;
      }
      const refund = b.constructionStarted ? Math.floor(BUILD_COST[b.type] / 2) : BUILD_COST[b.type];
      const cancelledId = b.id;
      g.buildings = g.buildings.filter((building) => building.id !== cancelledId);
      for (const worker of g.units.filter((unit) => unit.team === "player" && unit.type === "worker")) {
        const queue = (worker.buildQueue || (worker.buildTarget ? [worker.buildTarget] : [])).filter((id) => id !== cancelledId);
        worker.buildQueue = queue;
        worker.buildTarget = queue[0];
        if (!queue.length && worker.workerMode === "construct") worker.workerMode = "mine";
        worker.nav = undefined;
      }
      g.selected = [];
      g.mode = "select";
      g.alloy += refund;
      g.matchStats.meaningfulActions++;
      g.message = `${b.type.toUpperCase()} construction cancelled · ${refund} alloy refunded. Remaining sites renumbered.`;
      sync();
      return;
    }
    if (name === "fortify") {
      if (!b || b.type !== "hq" || !buildingOperational(b)) {
        g.message = "Select your HQ first to run the Fortify Base upgrade.";
      } else if (g.fortified) {
        g.message = "Fortify Base is already complete.";
      } else if (g.fortifyProduction) {
        g.message = `Fortify Base is already in progress — ${Math.max(0, Math.ceil(g.fortifyProduction.duration - g.fortifyProduction.elapsed))} seconds remaining.`;
      } else if (g.intel < FORTIFY_INTEL_COST) {
        g.message = `Fortify Base requires ${FORTIFY_INTEL_COST} intel.`;
      } else if (g.doctrineProduction) {
        g.message = "HQ is researching a doctrine — wait for it to complete.";
      } else if (b.production) {
        g.message = "HQ is producing a unit — finish its queue before starting Fortify Base.";
      } else {
        g.intel -= FORTIFY_INTEL_COST;
        g.matchStats.meaningfulActions++;
        g.fortifyProduction = { elapsed: 0, duration: FORTIFY_DURATION };
        g.message = "FORTIFY BASE started — HQ upgrade completes in 40 seconds.";
      }
      sync();
      return;
    }
    if (name === "doctrine-air" || name === "doctrine-armor") {
      const doctrine: Doctrine = name === "doctrine-air" ? "air" : "armor";
      if (!b || b.type !== "hq" || !buildingOperational(b)) {
        g.message = "Select your HQ first to commit to a doctrine.";
      } else if (g.doctrine) {
        g.message = `${g.doctrine === "air" ? "Air Superiority" : "Armored Command"} is locked in for this match.`;
      } else if (g.doctrineProduction) {
        g.message = "Doctrine research is already in progress.";
      } else if (g.fortifyProduction || b.production) {
        g.message = "HQ is busy — finish its current operation first.";
      } else if (g.intel < DOCTRINE_INTEL_COST) {
        g.message = `${doctrine === "air" ? "Air Superiority" : "Armored Command"} requires ${DOCTRINE_INTEL_COST} intel.`;
      } else {
        g.intel -= DOCTRINE_INTEL_COST;
        g.doctrineProduction = { type: doctrine, elapsed: 0, duration: DOCTRINE_DURATION };
        g.message = `${doctrine === "air" ? "AIR SUPERIORITY" : "ARMORED COMMAND"} research started — choice becomes permanent in ${DOCTRINE_DURATION} seconds.`;
      }
      sync();
      return;
    }
    const selectedUnits = g.units.filter((unit) => unit.team === "player" && g.selected.includes(unit.id));
    const selectedWorkers = selectedUnits.filter((unit) => unit.type === "worker");
    const selectedCombat = selectedUnits.filter((unit) => unit.type !== "worker");
    if (name === "move" || name === "move-engage") {
      if (!selectedUnits.length) g.message = "Select units before issuing a move order.";
      else {
        g.mode = name;
        g.message = `${name === "move-engage" ? "MOVE + ENGAGE" : "DIRECT MOVE"}: choose a destination.`;
      }
      sync();
      return;
    }
    if (name === "repair") {
      if (!selectedWorkers.length) g.message = "Select one or more Workers first.";
      else {
        g.mode = "repair";
        g.message = "REPAIR ORDER: choose a damaged friendly unit or structure.";
      }
      sync();
      return;
    }
    if (name === "auto-repair") {
      if (!selectedWorkers.length) g.message = "Select one or more Workers first.";
      else {
        const enable = selectedWorkers.some((worker) => !worker.autoRepair);
        selectedWorkers.forEach((worker) => {
          worker.autoRepair = enable;
          clearWorkerConstruction(worker, enable ? "hold" : "mine");
          worker.repairTarget = undefined;
          worker.enemy = undefined;
          worker.target = undefined;
          worker.nav = undefined;
          if (!enable) {
            worker.patrol = undefined;
            if (worker.stance === "patrol") worker.stance = "pursue";
          }
        });
        g.matchStats.meaningfulActions++;
        g.message = enable
          ? "AUTO REPAIR ON — selected Workers stop mining and repair damaged friendly units and structures."
          : "AUTO REPAIR OFF — selected Workers return to normal mining duty.";
      }
      sync();
      return;
    }
    if (name === "hold" || name === "pursue") {
      if (!selectedCombat.length) g.message = "Select combat units before changing engagement behavior.";
      else {
        selectedCombat.forEach((unit) => {
          unit.stance = name;
          unit.retreating = false;
          unit.moveEngage = false;
          unit.patrol = undefined;
          if (name === "hold") {
            unit.target = undefined;
            unit.enemy = undefined;
            unit.nav = undefined;
          }
        });
        g.matchStats.meaningfulActions++;
        g.message = name === "hold"
          ? "SENTRY MODE — robots deploy as stationary turrets with 35% greater range."
          : "PURSUE — units may chase visible enemies within their sight range.";
      }
      sync();
      return;
    }
    if (name === "patrol") {
      const selectedPatrollers = [...selectedCombat, ...selectedWorkers.filter((worker) => worker.autoRepair)];
      if (!selectedPatrollers.length) g.message = "Select combat units or Auto Repair Workers before creating a patrol route.";
      else {
        g.mode = "set-patrol-a";
        g.message = selectedPatrollers.some((unit) => unit.type === "worker")
          ? "MAINTENANCE PATROL: choose the first patrol point."
          : "PATROL: choose the first patrol point.";
      }
      sync();
      return;
    }
    if (name === "retreat") {
      const hq = g.buildings.find((building) => building.team === "player" && building.type === "hq" && buildingOperational(building));
      const units = g.units.filter((unit) => unit.team === "player" && g.selected.includes(unit.id) && unit.type !== "worker");
      if (!hq || !units.length) {
        g.message = "Select combat units and keep your HQ deployed before issuing a retreat.";
      } else {
        units.forEach((unit, index) => {
          unit.enemy = undefined;
          unit.nav = undefined;
          unit.retreating = true;
          unit.moveEngage = false;
          unit.target = { x: hq.x + (index % 3) * 28 - 28, y: hq.y + 95 + Math.floor(index / 3) * 24 };
        });
        g.message = "RETREAT ORDER — units move 20% faster and reinforce at HQ, but will not engage en route.";
      }
      sync();
      return;
    }
    const type = name as Unit["type"];
    if (!["worker", "trooper", "tank", "drone"].includes(type)) return;
    const wanted = type === "worker" ? "hq" : "barracks";
    const selectedProduction = g.buildings.find(
      (x) =>
        x.team === "player" &&
        g.selected.includes(x.id) &&
        x.type === wanted &&
        buildingOperational(x),
    );
    if (!selectedProduction) {
      g.message =
        type === "worker"
          ? "Select your HQ first to show and train Workers."
          : g.buildings.some((x) => x.team === "player" && x.type === "barracks")
            ? "Select a completed Barracks first to show and train combat units."
            : "Build and complete a Barracks first to unlock Troopers, Tanks, and Drones.";
      sync();
      return;
    }
    if (type === "worker" && (g.fortifyProduction || g.doctrineProduction)) {
      g.message = "HQ is busy with an upgrade — Worker production is paused.";
      sync();
      return;
    }
    b = selectedProduction;
    if (!b.production && (b.cooldown || 0) > 0) {
      g.message = `${b.type.toUpperCase()} recovering — ${Math.ceil(b.cooldown || 0)} seconds until the next production burst.`;
      sync();
      return;
    }
    const pending = (b.production?.queue?.length || 0) + (b.production ? 1 : 0);
    if (pending >= MAX_QUEUE) {
      g.message = `${b.type.toUpperCase()} queue is full (${MAX_QUEUE} units).`;
      sync();
      return;
    }
    if (g.credits < unitCost[type]) {
      g.message = "Insufficient credits.";
      sync();
      return;
    }
    g.credits -= unitCost[type];
    g.matchStats.totalCreditsSpent += unitCost[type];
    g.matchStats.meaningfulActions++;
    g.matchStats.unitsBuilt += type === "worker" ? 1 : 0;
    g.matchStats.combatUnitsBuilt += type === "worker" ? 0 : 1;
    g.selected = [b.id];
    if (!b.production) {
      b.production = {
        type,
        elapsed: 0,
        duration: productionDurationFor(g, "player", type),
        queue: [],
      };
      g.message = `${unitName(type)} production started at ${b.type.toUpperCase()}.`;
    } else {
      b.production.queue = [...(b.production.queue || []), type];
      g.message = `${unitName(type)} added to queue · ${pending + 1}/${MAX_QUEUE} units queued.`;
    }
    sync();
  };

  const centerOnSelection = () => {
    const g = game.current;
    const selected = [...g.units, ...g.buildings].filter((o) =>
      g.selected.includes(o.id),
    );
    if (!selected.length) return;
    g.camera.x = selected.reduce((sum, o) => sum + o.x, 0) / selected.length;
    g.camera.y = selected.reduce((sum, o) => sum + o.y, 0) / selected.length;
    g.message = "Camera centered on selection.";
    sync();
  };

  const cancelCommandMode = () => {
    const g = game.current;
    if (g.mode === "select") return false;
    if (g.mode === "set-patrol-a" || g.mode === "set-patrol-b") {
      g.units.filter((unit) => g.selected.includes(unit.id)).forEach((unit) => {
        if (unit.stance !== "patrol") unit.patrol = undefined;
      });
    }
    g.mode = "select";
    g.message = "Command canceled.";
    sync();
    return true;
  };

  useEffect(() => {
    resize();
    addEventListener("resize", resize);
    const kd = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys.current.add(key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(key))
        e.preventDefault();
      if (e.repeat && !["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
        return;

      const g = game.current;
      if (key === "escape") {
        e.preventDefault();
        if (cancelCommandMode()) return;
        setPause(!pausedRef.current);
        return;
      }
      if (key === "p" && !g.selected.some((id) => g.units.some((unit) => unit.id === id && unit.team === "player"))) {
        setPause(!pausedRef.current);
        return;
      }
      if (pausedRef.current || g.over) return;

      if (/^[1-9]$/.test(key)) {
        const group = Number(key);
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const valid = new Set([...g.units, ...g.buildings].map((o) => o.id));
          controlGroups.current[group] = g.selected.filter((id) => valid.has(id));
          g.message = controlGroups.current[group].length
            ? `Control group ${group} assigned (${controlGroups.current[group].length}).`
            : `Control group ${group} cleared.`;
          lastGroupKey.current = null;
          sync();
        } else {
          const valid = new Set([...g.units, ...g.buildings].map((o) => o.id));
          const recalled = (controlGroups.current[group] || []).filter((id) => valid.has(id));
          controlGroups.current[group] = recalled;
          if (recalled.length) {
            const now = performance.now();
            const doublePress = lastGroupKey.current?.group === group && now - lastGroupKey.current.time < 400;
            g.selected = recalled;
            g.mode = "select";
            g.message = `Control group ${group} selected (${recalled.length}).`;
            lastGroupKey.current = { group, time: now };
            if (doublePress) centerOnSelection();
            else sync();
          } else {
            g.message = `Control group ${group} is empty.`;
            sync();
          }
        }
        return;
      }

      if (key === " ") return centerOnSelection();
      if (key === "tab") {
        const hasWorker = g.selected.some((id) => g.units.some((unit) => unit.id === id && unit.team === "player" && unit.type === "worker"));
        const hasHq = g.selected.some((id) => g.buildings.some((building) => building.id === id && building.team === "player" && building.type === "hq" && buildingOperational(building)));
        if (hasWorker) setCommandTab((tab) => tab === "buildings" ? "units" : "buildings");
        else if (hasHq) setCommandTab((tab) => tab === "tech" ? "units" : "tech");
        return;
      }
      if (key === "x") return action("deselect");
      if (key === "h") {
        if (g.selected.some((id) => g.units.some((unit) => unit.id === id && unit.team === "player" && unit.type !== "worker"))) return action("hold");
        const hq = g.buildings.find((b) => b.team === "player" && b.type === "hq");
        if (hq) {
          g.selected = [hq.id];
          g.mode = "select";
          g.message = "HQ selected.";
          sync();
        }
        return;
      }
      if (key === "z") return action("move");
      if (key === "c") return action("pursue");
      if (key === "p") return action("patrol");
      if (key === "y") return action("repair");
      if (key === "o") return action("auto-repair");
      if (key === "r") { setCommandTab("buildings"); return action("build-refinery"); }
      if (key === "b") { setCommandTab("buildings"); return action("build-barracks"); }
      if (key === "t") { setCommandTab("buildings"); return action("build-turret"); }
      if (key === "v") { setCommandTab("units"); return action("worker"); }
      if (key === "i") { setCommandTab("units"); return action("trooper"); }
      if (key === "k") { setCommandTab("units"); return action("tank"); }
      if (key === "n") { setCommandTab("units"); return action("drone"); }
      if (key === "e") { setCommandTab("units"); return action("retreat"); }
      if (key === "j") {
        const hq = g.buildings.find((building) => building.team === "player" && building.type === "hq" && g.selected.includes(building.id));
        if (hq) return action(hq.packed ? "deploy-hq" : "pack-hq");
      }
      if (key === "l") return action("move-hq");
      if (key === "q") {
        const hasHq = g.selected.some((id) => g.buildings.some((building) => building.id === id && building.team === "player" && building.type === "hq" && buildingOperational(building)));
        if (hasHq) setCommandTab("tech");
        else {
          g.message = "Select your HQ to open Research.";
          sync();
        }
        return;
      }
      if (key === "u") { setCommandTab("tech"); return action("doctrine-air"); }
      if (key === "m") { setCommandTab("tech"); return action("doctrine-armor"); }
      if (key === "g") return action("rally");
      if (key === "f") return action("fortify");
    },
      ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    return () => {
      removeEventListener("resize", resize);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
    };
  }, [resize]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    migrateCommanderStorage();
    setTutorialsEnabled(localStorage.getItem(TUTORIALS_KEY) !== "off");
    try {
      const savedTips = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || "[]");
      setDismissedTips(Array.isArray(savedTips) ? savedTips.filter((tip) => typeof tip === "string") : []);
    } catch {
      setDismissedTips([]);
    }
    const existingSave = localStorage.getItem(SAVE_KEY);
    game.current = loadGame();
    matchStarted.current = Boolean(existingSave);
    setHasAutosave(Boolean(existingSave));
    setNewMatchFog(existingSave ? game.current.fogEnabled : true);
    lastCountdown.current = Math.max(
      0,
      Math.ceil(game.current.waveAt - game.current.time),
    );
    sync();
    const timer = window.setInterval(save, 3000);
    const preserve = () => save();
    const visibility = () => {
      if (document.hidden) {
        setPause(true);
        save();
      }
    };
    addEventListener("pagehide", preserve);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      removeEventListener("pagehide", preserve);
      document.removeEventListener("visibilitychange", visibility);
      save();
    };
  }, [save]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    let raf: number;
    const tick = (ts: number) => {
      const dt = Math.min(0.04, (ts - last.current) / 1000 || 0);
      last.current = ts;
      if (!pausedRef.current) update(dt);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => () => peer.current?.close(), []);

  function update(dt: number) {
    const g = game.current;
    if (multiplayerRole.current === "guest") {
      const c = canvas.current;
      if (!c) return;
      if (keys.current.has("a") || keys.current.has("arrowleft")) g.camera.x -= 350 * dt;
      if (keys.current.has("d") || keys.current.has("arrowright")) g.camera.x += 350 * dt;
      if (keys.current.has("w") || keys.current.has("arrowup")) g.camera.y -= 350 * dt;
      if (keys.current.has("s") || keys.current.has("arrowdown")) g.camera.y += 350 * dt;
      const halfW = c.clientWidth / (2 * g.zoom), halfH = c.clientHeight / (2 * g.zoom);
      g.camera.x = Math.max(halfW, Math.min(W - halfW, g.camera.x));
      g.camera.y = Math.max(halfH, Math.min(H - halfH, g.camera.y));
      revealFog(g);
      return;
    }
    if (g.over) return;
    g.time += dt;
    g.attackAlerts = (g.attackAlerts || []).filter((alert) => alert.expiresAt > g.time);
    for (const hq of g.buildings.filter((building) => building.type === "hq" && building.hp > 0)) {
      if (hq.relocation) {
        hq.relocation.elapsed = Math.min(hq.relocation.duration, hq.relocation.elapsed + dt);
        if (hq.relocation.elapsed >= hq.relocation.duration) {
          const mode = hq.relocation.mode;
          hq.relocation = undefined;
          hq.packed = mode === "pack";
          if (mode === "deploy") hq.mobileTarget = undefined;
          if (hq.team === "player") {
            g.message = mode === "pack"
              ? "COMMAND CRAWLER ready — move it slowly, then deploy on clear terrain."
              : "HEADQUARTERS deployed — production, supply, research, and reinforcement restored.";
            sync();
          }
        }
      }
      if (hq.packed) movePackedHq(g, hq, dt);
    }
    for (const unit of g.units) {
      unit.moving = false;
      unit.mining = false;
      unit.building = false;
      unit.repairing = false;
      const inSupply = unitInSupplyRange(g, unit);
      unit.supply = inSupply
        ? Math.min(SUPPLY_CAPACITY, (unit.supply ?? SUPPLY_CAPACITY) + dt * 3)
        : Math.max(0, (unit.supply ?? SUPPLY_CAPACITY) - dt);
      const homeHq = g.buildings.find((building) => building.team === unit.team && building.type === "hq" && buildingOperational(building));
      if (homeHq && Math.hypot(homeHq.x - unit.x, homeHq.y - unit.y) <= 155) {
        unit.hp = Math.min(unit.max, unit.hp + (unit.retreating ? 12 : 4) * dt);
        if (unit.retreating && Math.hypot(homeHq.x - unit.x, homeHq.y - unit.y) <= 120) {
          unit.retreating = false;
          unit.target = undefined;
          unit.nav = undefined;
        }
      }
      if (unit.retreating) unit.enemy = undefined;
      const regenRate = veteranRegenRate(unit);
      if (regenRate > 0) {
        unit.hp = Math.min(unit.max, unit.hp + unit.max * regenRate * dt);
      }
    }
    revealFog(g);
    const enemyHq = g.buildings.find((building) => building.team === "enemy" && building.type === "hq");
    if (enemyHq && isVisible(g, enemyHq, buildingStats.hq.r)) {
      const discovered = g.enemyDoctrine || "none";
      if (g.scoutedEnemyDoctrine !== discovered) {
        g.scoutedEnemyDoctrine = discovered;
        g.enemyDoctrineKnown = true;
        g.message = discovered === "none"
          ? "SCOUT REPORT: No completed enemy doctrine detected."
          : `SCOUT REPORT: Enemy ${discovered === "air" ? "Air Superiority" : "Armored Command"} doctrine detected.`;
        sync();
      }
    }
    g.shots = (g.shots || [])
      .map((s) => ({ ...s, life: s.life - dt }))
      .filter((s) => s.life > 0);
    g.damageNumbers = (g.damageNumbers || [])
      .map((n) => ({ ...n, life: n.life - dt, y: n.y - 18 * dt }))
      .filter((n) => n.life > 0);
    for (const objective of g.objectives || []) {
      const playerPresence = g.units.filter(
        (unit) => unit.team === "player" && unit.hp > 0 && Math.hypot(unit.x - objective.x, unit.y - objective.y) <= 105,
      ).length;
      const enemyPresence = g.units.filter(
        (unit) => unit.team === "enemy" && unit.hp > 0 && Math.hypot(unit.x - objective.x, unit.y - objective.y) <= 105,
      ).length;
      if (playerPresence > 0 && enemyPresence === 0) {
        objective.capture = Math.min(OBJECTIVE_CAPTURE_TIME, objective.capture + dt * Math.min(2, playerPresence));
      } else if (enemyPresence > 0 && playerPresence === 0) {
        objective.capture = Math.max(-OBJECTIVE_CAPTURE_TIME, objective.capture - dt * Math.min(2, enemyPresence));
      }
      const oldOwner = objective.owner;
      if (objective.capture >= OBJECTIVE_CAPTURE_TIME) objective.owner = "player";
      else if (objective.capture <= -OBJECTIVE_CAPTURE_TIME) objective.owner = "enemy";
      else if ((objective.owner === "player" && objective.capture <= 0) || (objective.owner === "enemy" && objective.capture >= 0)) objective.owner = "neutral";
      if (objective.owner === "player") g.intel += OBJECTIVE_INTEL_RATE * dt;
      if (objective.owner === "enemy") g.enemyIntel += OBJECTIVE_INTEL_RATE * dt;
      if (objective.owner !== oldOwner) {
        if (objective.owner !== "enemy" || isVisible(g, objective, HIGH_GROUND_RADIUS)) {
          g.message = objective.owner === "neutral"
            ? "UPLINK CONTESTED — intel feed interrupted."
            : `${objective.owner === "player" ? "UPLINK SECURED" : "ENEMY UPLINK SECURED"} — intel income active.`;
          sync();
        }
      }
    }
    const playerArmyCount = g.units.filter((unit) => unit.team === "player" && unit.type !== "worker").length;
    const enemyArmyCount = g.units.filter((unit) => unit.team === "enemy" && unit.type !== "worker").length;
    g.credits = Math.max(0, g.credits - upkeepPerSecond(playerArmyCount) * dt);
    g.enemyCredits = Math.max(0, g.enemyCredits - upkeepPerSecond(enemyArmyCount) * dt);
    for (const building of g.buildings) {
      if ((building.cooldown || 0) > 0) building.cooldown = Math.max(0, (building.cooldown || 0) - dt);
    }
    const hudTick = Math.floor(g.time * 2);
    if (hudTick !== lastHudTick.current) {
      lastHudTick.current = hudTick;
      sync();
    }
    const countdown = Math.max(0, Math.ceil(g.waveAt - g.time));
    if (countdown !== lastCountdown.current) {
      lastCountdown.current = countdown;
      sync();
    }
    const c = canvas.current!;
    if (keys.current.has("a") || keys.current.has("arrowleft")) g.camera.x -= 350 * dt;
    if (keys.current.has("d") || keys.current.has("arrowright")) g.camera.x += 350 * dt;
    if (keys.current.has("w") || keys.current.has("arrowup")) g.camera.y -= 350 * dt;
    if (keys.current.has("s") || keys.current.has("arrowdown")) g.camera.y += 350 * dt;
    const halfW = c.clientWidth / (2 * g.zoom),
      halfH = c.clientHeight / (2 * g.zoom);
    g.camera.x = Math.max(halfW, Math.min(W - halfW, g.camera.x));
    g.camera.y = Math.max(halfH, Math.min(H - halfH, g.camera.y));
    for (const team of ["player", "enemy"] as const) {
      const production = team === "player" ? g.fortifyProduction : g.enemyFortifyProduction;
      if (!production) continue;
      production.elapsed = Math.min(production.duration, production.elapsed + dt);
      if (production.elapsed >= production.duration) {
        for (const structure of g.buildings.filter((x) => x.team === team)) {
          const oldMax = structure.max;
          structure.max = Math.round(oldMax * 1.25);
          structure.hp = Math.min(structure.max, structure.hp + Math.round(oldMax * 0.25));
        }
        if (team === "player") {
          g.fortified = true;
          g.fortifyProduction = undefined;
          g.message = "FORTIFY BASE complete — all current structures gained 25% integrity.";
        } else {
          g.enemyFortified = true;
          g.enemyFortifyProduction = undefined;
        }
        sync();
      }
    }
    for (const team of ["player", "enemy"] as const) {
      const production = team === "player" ? g.doctrineProduction : g.enemyDoctrineProduction;
      if (!production) continue;
      production.elapsed = Math.min(production.duration, production.elapsed + dt);
      if (production.elapsed >= production.duration) {
        if (team === "player") {
          g.doctrine = production.type;
          g.doctrineProduction = undefined;
          g.message = `${production.type === "air" ? "AIR SUPERIORITY" : "ARMORED COMMAND"} active — the alternate doctrine is permanently locked.`;
        } else {
          g.enemyDoctrine = production.type;
          g.enemyDoctrineProduction = undefined;
        }
        if (production.type === "armor") {
          for (const tank of g.units.filter((unit) => unit.team === team && unit.type === "tank")) {
            const bonus = Math.round(tank.max * .18);
            tank.max += bonus;
            tank.hp += bonus;
          }
        }
        sync();
      }
    }
    for (const b of g.buildings) {
      if (b.progress === undefined || b.progress >= 1) continue;
      const builders = g.units.filter((unit) => {
        const queueHead = unit.buildQueue?.[0] ?? unit.buildTarget;
        return unit.type === "worker" && unit.team === b.team && unit.hp > 0 && queueHead === b.id &&
          Math.hypot(unit.x - b.x, unit.y - b.y) <= buildingStats[b.type].r + 30;
      });
      if (!builders.length) continue;
      b.constructionStarted = true;
      const oldProgress = b.progress;
      const duration = b.constructionDuration || (b.type === "turret" ? buildingBuildTime.turret : 6);
      const buildSpeed = Math.min(1.6, 1 + (builders.length - 1) * .25);
      b.progress = Math.min(1, b.progress + (dt / duration) * buildSpeed);
      b.hp = Math.min(b.max, b.hp + b.max * (b.progress - oldProgress));
      if (b.progress < 1) continue;
      b.hp = b.max;
      for (const worker of g.units.filter((unit) => unit.type === "worker" && unit.team === b.team)) {
        const remaining = (worker.buildQueue || (worker.buildTarget ? [worker.buildTarget] : []))
          .filter((buildingId) => buildingId !== b.id);
        worker.buildQueue = remaining;
        worker.buildTarget = remaining[0];
        if (!remaining.length && worker.workerMode === "construct") worker.workerMode = "mine";
        worker.nav = undefined;
      }
      if (b.type !== "turret") {
        if (b.team === "player") g.power += b.type === "refinery" ? 4 : 2;
        else g.enemyPower = (g.enemyPower ?? 12) + (b.type === "refinery" ? 4 : 2);
      }
      if (b.team === "player" || isVisible(g, b, buildingStats[b.type].r)) {
        g.message = `${b.team === "enemy" ? "Enemy " : ""}${b.type} operational.`;
        sync();
      }
    }
    for (const b of g.buildings)
      if (
        b.production &&
        buildingOperational(b) &&
        !(b.type === "hq" && ((b.team === "player" && (g.fortifyProduction || g.doctrineProduction)) || (b.team === "enemy" && (g.enemyFortifyProduction || g.enemyDoctrineProduction))))
      ) {
        b.production.elapsed += dt;
        if (b.production.elapsed >= b.production.duration) {
          const type = b.production.type,
            spacing = type === "tank" ? 48 : 34;
          let spawn = { x: b.x + (b.team === "player" ? 70 : -70), y: b.y };
          for (let ring = 0; ring < 5; ring++) {
            const radius = 70 + ring * spacing,
              spots = 8 + ring * 4;
            const found = Array.from({ length: spots }, (_, i) => ({
              x: b.x + Math.cos((i / spots) * Math.PI * 2) * radius,
              y: b.y + Math.sin((i / spots) * Math.PI * 2) * radius,
            })).find((p) =>
              g.units.every((u) => Math.hypot(u.x - p.x, u.y - p.y) > spacing),
            );
            if (found) {
              spawn = found;
              break;
            }
          }
          const id = g.nextId++;
          const deployedHealth = Math.round(unitHealth[type] * (type === "tank" && teamDoctrine(g, b.team) === "armor" ? 1.18 : 1));
          const rallyTarget = b.rally
            ? {
                x: b.rally.x + Math.cos(id * 2.399) * 42,
                y: b.rally.y + Math.sin(id * 2.399) * 42,
              }
            : undefined;
          g.units.push({
            id,
            team: b.team,
            type,
            ...spawn,
            target: rallyTarget,
            hp: deployedHealth,
            max: deployedHealth,
            xp: 0,
            level: 1,
            supply: SUPPLY_CAPACITY,
          });
          const next = b.production.queue?.shift();
          if (next)
            b.production = {
              type: next,
              elapsed: -PRODUCTION_COOLDOWN,
              duration: productionDurationFor(g, b.team, next),
              queue: b.production.queue || [],
            };
          else {
            b.production = undefined;
            b.cooldown = PRODUCTION_COOLDOWN;
          }
          if (b.team === "player")
            g.message = next
              ? `${unitName(type)} deployed · ${unitName(next)} production started.`
              : `${unitName(type)} ready and deployed.`;
          sync();
        }
      }
    const objs = () => [...g.units, ...g.buildings];
    for (const u of g.units) {
      if (u.hp <= 0) continue;
      let target = objs().find(
        (o) =>
          o.id === u.enemy &&
          o.team !== u.team &&
          Number.isFinite(o.hp) &&
          o.hp > 0,
      );
      if (!target && u.enemy !== undefined) {
        u.enemy = undefined;
        u.nav = undefined;
      }
      if (target && u.moveEngage && u.target) {
        const travelSight = u.type === "drone" ? 320 : u.type === "tank" ? 280 : 230;
        if (Math.hypot(target.x - u.x, target.y - u.y) > travelSight * 1.35) {
          u.enemy = undefined;
          u.nav = undefined;
          target = undefined;
        }
      }
      if (u.type === "worker" && u.autoRepair && (!u.target || u.stance === "patrol")) {
        let repairable = [...g.buildings, ...g.units].find((object) =>
          object.id === u.repairTarget &&
          object.id !== u.id &&
          object.team === u.team &&
          object.hp > 0 &&
          object.hp < object.max &&
          (isUnit(object) || buildingOperational(object)),
        );
        if (!repairable) {
          u.repairTarget = undefined;
          const scanRadius = u.stance === "patrol" ? MAINTENANCE_PATROL_SCAN : Infinity;
          repairable = [...g.buildings, ...g.units]
            .filter((object) =>
              object.id !== u.id &&
              object.team === u.team &&
              object.hp > 0 &&
              object.hp < object.max &&
              (isUnit(object) || buildingOperational(object)) &&
              Math.hypot(object.x - u.x, object.y - u.y) <= scanRadius,
            )
            .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
          if (repairable) u.repairTarget = repairable.id;
        }
        if (repairable) {
          u.enemy = undefined;
          u.target = undefined;
          u.nav = undefined;
          target = undefined;
        }
      }
      if (u.stance === "patrol" && u.patrol && !target && !u.target && !u.repairTarget) {
        const aDistance = Math.hypot(u.patrol.a.x - u.x, u.patrol.a.y - u.y);
        const bDistance = Math.hypot(u.patrol.b.x - u.x, u.patrol.b.y - u.y);
        const resumeAt = aDistance <= bDistance ? "a" : "b";
        u.target = { ...(resumeAt === "a" ? u.patrol.a : u.patrol.b) };
        u.patrol.next = resumeAt === "a" ? "b" : "a";
      }
      // Direct travel ignores threats. Engage travel may fight nearby targets,
      // but keeps the original destination and resumes after combat.
      const engagingWhileTraveling = Boolean(u.moveEngage && u.target);
      if (u.type !== "worker" && !u.retreating && (!u.target || u.stance === "patrol" || engagingWhileTraveling)) {
        const sight = u.stance === "hold"
          ? unitCombatRange(u)
          : u.type === "drone" ? 320 : u.type === "tank" ? 280 : 230;
        const nearby = objs()
          .filter(
            (o) =>
              o.team !== u.team &&
              Number.isFinite(o.hp) &&
              o.hp > 0 &&
              Math.hypot(o.x - u.x, o.y - u.y) <= sight,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - u.x, a.y - u.y) -
              Math.hypot(b.x - u.x, b.y - u.y),
          )[0];
        const targetId = target?.id;
        const targetIsBuilding = targetId !== undefined && g.buildings.some((b) => b.id === targetId);
        if (nearby && (!target || targetIsBuilding)) {
          target = nearby;
          u.enemy = nearby.id;
          if (!engagingWhileTraveling) u.target = undefined;
          u.nav = undefined;
        }
      }
      if (target) {
        const d = Math.hypot(target.x - u.x, target.y - u.y),
          s = stats[u.type],
          range = unitCombatRange(u);
        u.facing = Math.atan2(target.y - u.y, target.x - u.x);
        if (d > range) {
          if (u.stance === "hold") {
            u.enemy = undefined;
          } else {
            const targetBuilding = g.buildings.find((b) => b.id === target.id);
            moveUnitToward(g, u, target, dt, targetBuilding?.id);
          }
        } else {
          attackTimers.current[u.id] =
            (Number.isFinite(attackTimers.current[u.id])
              ? attackTimers.current[u.id]
              : 0) - dt;
          if (attackTimers.current[u.id] <= 0) {
            const wasAlive = target.hp > 0,
              level = u.level || 1,
              damage = Math.max(1, s.damage * (1 + (level - 1) * 0.18) * supplyMultiplier(u) * doctrineMultiplier(g, u) * counterMultiplier(u, target) * terrainMultiplier(g, u, target));
            const actualDamage = Math.min(target.hp, damage);
            const isBuilding = g.buildings.some((b) => b.id === target.id);
            target.hp = Math.max(0, target.hp - actualDamage);
            recordAttackAlert(g, target);
            u.lastCombatAt = g.time;
            if (!isBuilding && isUnit(target)) target.lastCombatAt = g.time;
            if (isBuilding && target.team === "player") {
              g.matchStats.baseDamage += actualDamage;
            }
            g.damageNumbers.push({ x: target.x, y: target.y - 18, amount: Math.round(damage), life: 0.9, team: u.team });
            g.shots.push({
              x: u.x,
              y: u.y,
              tx: target.x,
              ty: target.y,
              team: u.team,
              kind: u.type === "tank" ? "shell" : "bullet",
              life: u.type === "tank" ? 0.22 : 0.11,
              maxLife: u.type === "tank" ? 0.22 : 0.11,
            });
            if (u.type === "trooper" || u.type === "tank" || u.type === "drone") {
              u.attackUntil = g.time + (u.type === "tank" ? 0.30 : 0.18);
            }
            if (wasAlive && target.hp <= 0) {
              if (!isBuilding && isUnit(target)) {
                const ownValue = g.units
                  .filter((unit) => unit.team === u.team && unit.type !== "worker" && unit.hp > 0)
                  .reduce((sum, unit) => sum + unitCost[unit.type], 0);
                const opposingValue = g.units
                  .filter((unit) => unit.team !== u.team && unit.type !== "worker" && unit.hp > 0)
                  .reduce((sum, unit) => sum + unitCost[unit.type], 0);
                if (ownValue < opposingValue * .8) {
                  const bounty = Math.max(20, Math.round(unitCost[target.type] * .22));
                  if (u.team === "player") g.credits += bounty;
                  else g.enemyCredits += bounty;
                  g.message = `${u.team === "player" ? "COMEBACK BOUNTY" : "Enemy comeback bounty"}: +${bounty} credits for eliminating a superior force.`;
                }
              }
              u.xp =
                (u.xp || 0) +
                (isBuilding ? 55 : target.type === "tank" ? 45 : 25);
              const old = u.level || 1;
              u.level = (u.xp || 0) >= 180 ? 3 : (u.xp || 0) >= 75 ? 2 : 1;
              if (u.level > old) {
                u.max = Math.round(u.max * 1.12);
                u.hp = Math.min(u.max, u.hp + Math.round(u.max * 0.25));
                g.message = `${u.team === "enemy" ? "Enemy " : ""}${u.type.toUpperCase()} promoted to rank ${u.level} — +18% damage, +12% max HP, ${(veteranRegenRate(u) * 100).toFixed(0)}% HP/s continuous veteran regeneration.`;
                sync();
              }
            }
            attackTimers.current[u.id] = s.rate;
          }
        }
      } else if (u.target) {
        const d = Math.hypot(u.target.x - u.x, u.target.y - u.y);
        if (d < 4) {
          if (u.stance === "patrol" && u.patrol) {
            const destination = u.patrol.next === "a" ? u.patrol.a : u.patrol.b;
            u.patrol.next = u.patrol.next === "a" ? "b" : "a";
            u.target = { ...destination };
            u.nav = undefined;
          } else {
            u.target = undefined;
            u.nav = undefined;
            u.moveEngage = false;
          }
        } else moveUnitToward(g, u, u.target, dt);
      }
      if (u.type === "worker" && !u.target && !target) {
        const buildQueue = [...(u.buildQueue || (u.buildTarget ? [u.buildTarget] : []))];
        let construction: Building | undefined;
        while (buildQueue.length && !construction) {
          construction = g.buildings.find(
            (building) => building.id === buildQueue[0] && building.team === u.team && building.hp > 0 && (building.progress ?? 1) < 1,
          );
          if (!construction) buildQueue.shift();
        }
        u.buildQueue = buildQueue;
        u.buildTarget = buildQueue[0];
        if (!construction && u.workerMode === "construct") {
          u.workerMode = "mine";
          u.nav = undefined;
        }
        if (construction) {
          const buildDistance = Math.hypot(construction.x - u.x, construction.y - u.y);
          if (buildDistance > buildingStats[construction.type].r + 25) {
            moveUnitToward(g, u, construction, dt, construction.id);
          } else {
            u.facing = Math.atan2(construction.y - u.y, construction.x - u.x);
            u.building = true;
            construction.constructionStarted = true;
          }
          continue;
        }
        const repairTarget = [...g.buildings, ...g.units].find(
          (object) =>
            object.id === u.repairTarget &&
            object.id !== u.id &&
            object.team === u.team &&
            object.hp > 0 &&
            object.hp < object.max &&
            (isUnit(object) || buildingOperational(object)),
        );
        if (!repairTarget) {
          u.repairTarget = undefined;
          if (u.workerMode === "repair" && !u.autoRepair) {
            u.workerMode = "hold";
            u.nav = undefined;
            continue;
          }
        }
        if (repairTarget) {
          const repairDistance = Math.hypot(repairTarget.x - u.x, repairTarget.y - u.y);
          if (repairDistance > objectRadius(repairTarget) + 24) {
            moveUnitToward(g, u, repairTarget, dt, isUnit(repairTarget) ? undefined : repairTarget.id);
          } else {
            const availableAlloy = u.team === "player" ? g.alloy : g.enemyAlloy;
            const repair = Math.min(
              repairTarget.max - repairTarget.hp,
              REPAIR_RATE * dt,
              availableAlloy / REPAIR_ALLOY_PER_HP,
            );
            if (repair > 0) {
              repairTarget.hp = Math.min(repairTarget.max, repairTarget.hp + repair);
              if (u.team === "player") g.alloy = Math.max(0, g.alloy - repair * REPAIR_ALLOY_PER_HP);
              else g.enemyAlloy = Math.max(0, g.enemyAlloy - repair * REPAIR_ALLOY_PER_HP);
              u.facing = Math.atan2(repairTarget.y - u.y, repairTarget.x - u.x);
              u.repairing = true;
            }
          }
          continue;
        }
        if (u.autoRepair) continue;
        if (u.workerMode === "hold") continue;
        const ref = g.buildings.find(
          (b) => b.team === u.team && b.type === "refinery" && b.progress === 1,
        );
        if (ref) {
          const cargoKind = u.carryingType || "credits";
          const crystal = g.crystals
            .filter((x) => x.amount > 0 && (!(u.carrying || 0) || (x.kind || "credits") === cargoKind))
            .sort(
              (a, b) =>
                (Math.hypot(a.x - u.x, a.y - u.y) + Math.hypot(a.x - ref.x, a.y - ref.y) * .35) -
                (Math.hypot(b.x - u.x, b.y - u.y) + Math.hypot(b.x - ref.x, b.y - ref.y) * .35),
            )[0];
          if ((u.carrying || 0) >= 100) {
            const d = Math.hypot(ref.x - u.x, ref.y - u.y);
            if (d < 55) {
              if (u.team === "player") {
                if (cargoKind === "alloy") g.alloy += u.carrying!;
                else g.credits += u.carrying!;
              } else if (cargoKind === "alloy") g.enemyAlloy += u.carrying!;
              else g.enemyCredits += u.carrying!;
              u.carrying = 0;
              u.carryingType = undefined;
              sync();
            } else {
              moveUnitToward(g, u, ref, dt, ref.id);
            }
          } else if (crystal) {
            const d = Math.hypot(crystal.x - u.x, crystal.y - u.y);
            if (d < 35) {
              const take = Math.min(crystal.amount, 32 * dt);
              crystal.amount -= take;
              u.carrying = (u.carrying || 0) + take;
              u.carryingType = crystal.kind || "credits";
              u.facing = Math.atan2(crystal.y - u.y, crystal.x - u.x);
              u.mining = true;
            } else {
              moveUnitToward(g, u, crystal, dt);
            }
          }
        }
      }
    }
    // Sentries are automatic defenses. They shoot only what they can cover;
    // they never provide a hidden combat bonus to the player.
    for (const turret of g.buildings.filter(
      (b) => b.type === "turret" && (b.progress === undefined || b.progress >= 1) && b.hp > 0,
    )) {
      const target = g.units
        .filter(
          (u) =>
            u.team !== turret.team &&
            u.hp > 0 &&
            Math.hypot(u.x - turret.x, u.y - turret.y) <= turretStats.range,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - turret.x, a.y - turret.y) -
            Math.hypot(b.x - turret.x, b.y - turret.y),
        )[0];
      if (!target) continue;
      turret.turretFacing = Math.atan2(target.y - turret.y, target.x - turret.x);
      attackTimers.current[turret.id] =
        (Number.isFinite(attackTimers.current[turret.id])
          ? attackTimers.current[turret.id]
          : 0) - dt;
      if (attackTimers.current[turret.id] <= 0) {
        target.hp = Math.max(0, target.hp - turretStats.damage);
        recordAttackAlert(g, target);
        target.lastCombatAt = g.time;
        g.damageNumbers.push({ x: target.x, y: target.y - 18, amount: turretStats.damage, life: 0.9, team: turret.team });
        g.shots.push({ x: turret.x, y: turret.y, tx: target.x, ty: target.y, team: turret.team, kind: "bullet", life: 0.12, maxLife: 0.12 });
        turret.turretFireUntil = g.time + 0.16;
        attackTimers.current[turret.id] = turretStats.rate;
      }
    }
    for (let i = 0; i < g.units.length; i++)
      for (let j = i + 1; j < g.units.length; j++) {
        const a = g.units[i], b = g.units[j];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const min = (stats[a.type].r + stats[b.type].r) * 0.8;
        if (d < min) {
          const angle = d > 0.01 ? Math.atan2(b.y - a.y, b.x - a.x) : (a.id + b.id) * 2.399;
          const shift = (min - d) / 2 + 0.15;
          const dx = Math.cos(angle) * shift, dy = Math.sin(angle) * shift;
          a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
        }
      }
    for (const u of g.units)
      for (const b of g.buildings) {
        if (u.type === "drone") continue;
        const d = Math.hypot(u.x - b.x, u.y - b.y);
        const min = stats[u.type].r + buildingStats[b.type].r * 0.72;
        if (d < min) {
          const angle = d > 0.01 ? Math.atan2(u.y - b.y, u.x - b.x) : u.id * 2.399;
          const shift = min - d + 0.15;
          u.x += Math.cos(angle) * shift; u.y += Math.sin(angle) * shift;
        }
      }
    for (const u of g.units) {
      if (u.type === "drone") continue;
      for (const ridge of TERRAIN_RIDGES) {
        const d = Math.hypot(u.x - ridge.x, u.y - ridge.y);
        const min = stats[u.type].r + ridge.r * .82;
        if (d < min) {
          const angle = d > .01 ? Math.atan2(u.y - ridge.y, u.x - ridge.x) : u.id * 2.399;
          u.x += Math.cos(angle) * (min - d + .2);
          u.y += Math.sin(angle) * (min - d + .2);
        }
      }
      for (const crystal of g.crystals.filter((node) => node.amount > 0)) {
        // Deposits that generated beside a ramp stay collectible, but they do
        // not narrow the only legal entrance or pin units against the cliff.
        if (inPlateauRampLane(crystal, 28)) continue;
        const d = Math.hypot(u.x - crystal.x, u.y - crystal.y);
        const min = stats[u.type].r + 18;
        if (d < min) {
          const angle = d > .01 ? Math.atan2(u.y - crystal.y, u.x - crystal.x) : u.id * 2.399;
          u.x += Math.cos(angle) * (min - d + .15);
          u.y += Math.sin(angle) * (min - d + .15);
        }
      }
    }
    const deadUnits = g.units.filter((u) => u.hp <= 0);
    for (const u of deadUnits) {
      if (u.team === "player") g.matchStats.unitsLost++;
      else g.matchStats.enemyUnitsDestroyed++;
    }
    g.units = g.units.filter((u) => u.hp > 0);
    g.matchStats.peakArmy = Math.max(g.matchStats.peakArmy, g.units.filter((u) => u.team === "player" && u.type !== "worker").length);
    g.buildings = g.buildings.filter((b) => b.hp > 0);
    if (multiplayerRole.current === "solo" && g.time >= g.aiThinkAt) {
      g.aiThinkAt = g.time + 0.2;
      runAI(g);
    }
    if (!g.buildings.some((b) => b.team === "player" && b.type === "hq")) {
      g.over = "lost";
      if (multiplayerRole.current === "solo" && !g.resultRecorded) {
        saveResult("lost", g);
        setCommandProfile(readCommandProfile());
        g.resultRecorded = true;
      }
      sync();
    }
    if (!g.buildings.some((b) => b.team === "enemy" && b.type === "hq")) {
      g.over = "won";
      if (multiplayerRole.current === "solo" && !g.resultRecorded) {
        saveResult("won", g);
        setCommandProfile(readCommandProfile());
        g.resultRecorded = true;
      }
      sync();
    }
    if (multiplayerRole.current === "host" && peer.current?.open && g.time - networkSnapshotAt.current >= 0.1) {
      networkSnapshotAt.current = g.time;
      peerSend({ type: "state", game: g });
    }
  }

  function runAI(g: Game) {
    const ai = Math.max(0.82, Math.min(1.18, g.adaptive || 1));
    const easiest = isEasiest(ai);
    // The AI can still think continuously, but meaningful decisions are
    // rate-limited so it cannot instantly chain perfect production and attacks.
    // Level 1 gets roughly one decision every 4 seconds; Expert gets one/sec.
    const actionsPerMinute = easiest ? 15 : Math.round(15 + ((ai - 0.82) / 0.36) * 45);
    if (g.time < (g.aiActionAt ?? 0)) return;
    const nextAction = () => { g.aiActionAt = g.time + 60 / actionsPerMinute; };
    const enemyBuildings = g.buildings.filter((b) => b.team === "enemy"),
      hq = enemyBuildings.find((b) => b.type === "hq"),
      ref = enemyBuildings.find((b) => b.type === "refinery"),
      barracks = enemyBuildings.find((b) => b.type === "barracks"),
      workers = g.units.filter(
        (u) => u.team === "enemy" && u.type === "worker",
      ),
      army = g.units.filter((u) => u.team === "enemy" && u.type !== "worker");
    if (!hq) return;
    if (!g.enemyDoctrine && !g.enemyDoctrineProduction && !g.enemyFortifyProduction && !hq.production && g.enemyIntel >= DOCTRINE_INTEL_COST) {
      const playerTanks = g.units.filter((unit) => unit.team === "player" && unit.type === "tank").length;
      const playerTroopers = g.units.filter((unit) => unit.team === "player" && unit.type === "trooper").length;
      const choice: Doctrine = playerTanks > playerTroopers ? "air" : "armor";
      g.enemyIntel -= DOCTRINE_INTEL_COST;
      g.enemyDoctrineProduction = { type: choice, elapsed: 0, duration: DOCTRINE_DURATION };
      nextAction();
      return;
    }
    if (!ref && g.enemyAlloy >= BUILD_COST.refinery) {
      g.enemyAlloy -= BUILD_COST.refinery;
      const building: Building = {
        id: g.nextId++,
        team: "enemy",
        type: "refinery",
        x: ENEMY_BASE.x - 20,
        y: ENEMY_BASE.y - 135,
        hp: 1,
        max: 440,
        progress: 0,
        constructionDuration: buildingBuildTime.refinery,
        constructionStarted: false,
      };
      g.buildings.push(building);
      const builder = [...workers].sort((a, b) => Math.hypot(a.x - building.x, a.y - building.y) - Math.hypot(b.x - building.x, b.y - building.y))[0];
      if (builder) queueWorkerConstruction(builder, building.id);
      if (isVisible(g, building, buildingStats.refinery.r)) g.message = "Enemy refinery construction detected.";
      nextAction();
      sync();
      return;
    }
    if (!barracks && g.enemyAlloy >= BUILD_COST.barracks) {
      g.enemyAlloy -= BUILD_COST.barracks;
      const building: Building = {
        id: g.nextId++,
        team: "enemy",
        type: "barracks",
        x: ENEMY_BASE.x - 80,
        y: ENEMY_BASE.y + 130,
        hp: 1,
        max: 520,
        progress: 0,
        constructionDuration: buildingBuildTime.barracks,
        constructionStarted: false,
      };
      g.buildings.push(building);
      const builder = [...workers].sort((a, b) => Math.hypot(a.x - building.x, a.y - building.y) - Math.hypot(b.x - building.x, b.y - building.y))[0];
      if (builder) queueWorkerConstruction(builder, building.id);
      if (isVisible(g, building, buildingStats.barracks.r)) g.message = "Enemy barracks construction detected.";
      nextAction();
      sync();
      return;
    }
    const workerGoal = Math.round(3 * ai);
    if (workers.length < workerGoal && g.enemyCredits >= 150 && !hq.production && !(hq.cooldown || 0) && !g.enemyDoctrineProduction && !g.enemyFortifyProduction) {
      g.enemyCredits -= 150;
      hq.production = {
        type: "worker",
        elapsed: 0,
        duration: productionDurationFor(g, "enemy", "worker"),
      };
      nextAction();
      return;
    }
    if (barracks && buildingOperational(barracks) && !barracks.production && !(barracks.cooldown || 0)) {
      const tankChance =
        army.length >= Math.round(5 * ai) && g.enemyCredits >= 400 && g.wave > 0;
      const playerArmor = g.units.filter((unit) => unit.team === "player" && unit.type === "tank").length;
      const droneChance = playerArmor >= 2 && g.enemyCredits >= unitCost.drone;
      if (tankChance) {
        g.enemyCredits -= 400;
        barracks.production = {
          type: "tank",
          elapsed: 0,
          duration: productionDurationFor(g, "enemy", "tank"),
        };
        nextAction();
      } else if (droneChance) {
        g.enemyCredits -= unitCost.drone;
        barracks.production = {
          type: "drone",
          elapsed: 0,
          duration: productionDurationFor(g, "enemy", "drone"),
        };
        nextAction();
      } else if (g.enemyCredits >= 125) {
        g.enemyCredits -= 125;
        barracks.production = {
          type: "trooper",
          elapsed: 0,
          duration: productionDurationFor(g, "enemy", "trooper"),
        };
        nextAction();
      }
    }
    const objectiveTarget = (g.objectives || [])
      .filter((objective) => objective.owner !== "enemy")
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    const objectiveSquad = army.filter((unit) => !unit.enemy && !unit.target).slice(0, 2);
    if (g.time >= 30 && objectiveTarget && objectiveSquad.length >= 2) {
      objectiveSquad.forEach((unit, index) => {
        unit.target = { x: objectiveTarget.x + (index ? 28 : -28), y: objectiveTarget.y };
        unit.nav = undefined;
      });
      nextAction();
      return;
    }
    const liveTargets = new Set(
      [...g.units, ...g.buildings]
        .filter((o) => o.team === "player" && o.hp > 0)
        .map((o) => o.id),
    );
    const ready = army.filter((u) => !u.enemy || !liveTargets.has(u.enemy));
    // Level 1 is meant to teach the game, not demand an immediate all-in.
    // Give the player a long opening and require a genuinely visible army.
    const required = easiest
      ? Math.min(12, Math.max(8, 8 + g.wave * 2))
      : Math.min(14, Math.max(4, Math.round((6 + g.wave * 2) * ai)));
    const openingGrace = easiest && g.wave === 0 ? 240 : 0;
    if (g.time >= Math.max(g.aiAttackAt, openingGrace) && ready.length >= required) {
      g.wave++;
      g.aiAttackAt = g.time + (easiest
        ? Math.max(150, 210 - g.wave * 8)
        : Math.max(75, (125 - g.wave * 5) / ai));
      g.waveAt = g.aiAttackAt;
      const target =
        g.buildings.find((b) => b.team === "player" && b.type === "hq") ||
        g.buildings.find((b) => b.team === "player");
      if (target)
        ready.forEach((u, i) => {
          u.enemy = target.id;
          u.target = {
            x: target.x + (i % 3) * 24,
            y: target.y + Math.floor(i / 3) * 24,
          };
          u.nav = undefined;
        });
      g.message = `INCOMING: Enemy assault ${g.wave} — enemy forces are advancing`;
      nextAction();
      sync();
    }
  }

  function draw() {
    const c = canvas.current;
    if (!c) return;
    const x = c.getContext("2d")!,
      g = game.current,
      w = c.clientWidth,
      h = c.clientHeight;
    x.clearRect(0, 0, w, h);
    x.save();
    x.translate(w / 2, h / 2);
    x.scale(g.zoom, g.zoom);
    x.translate(-g.camera.x, -g.camera.y);
    if (art.current.terrainLayer) {
      x.drawImage(art.current.terrainLayer, 0, 0);
    } else {
      x.fillStyle = "#101b1b";
      x.fillRect(0, 0, W, H);
    }
    // A very faint sector grid keeps long-distance navigation readable without
    // competing with the painted ground texture.
    x.strokeStyle = "rgba(142, 188, 172, .055)";
    x.lineWidth = 1;
    for (let i = 0; i < W; i += 200) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, H);
      x.stroke();
    }
    for (let i = 0; i < H; i += 200) {
      x.beginPath();
      x.moveTo(0, i);
      x.lineTo(W, i);
      x.stroke();
    }
    for (const objective of g.objectives || []) {
      const intel = objectiveIntel(g, objective);
      if (!intel.discovered) continue;
      x.save();
      x.fillStyle = intel.visible ? "rgba(172, 137, 74, .09)" : "rgba(106, 126, 121, .055)";
      x.strokeStyle = intel.visible ? "rgba(246, 211, 102, .24)" : "rgba(142, 168, 161, .15)";
      x.lineWidth = 2;
      x.beginPath(); x.arc(objective.x, objective.y, HIGH_GROUND_RADIUS, 0, Math.PI * 2); x.fill(); x.stroke();
      x.beginPath(); x.arc(objective.x, objective.y, HIGH_GROUND_RADIUS - 18, 0, Math.PI * 2); x.stroke();
      x.restore();
    }
    for (const plateau of TACTICAL_PLATEAUS) {
      x.save();
      x.translate(plateau.x, plateau.y);
      x.rotate(plateau.rotation);
      if (art.current.tacticalPlateau) {
        x.drawImage(art.current.tacticalPlateau, -230, -230, 460, 460);
      } else {
        x.fillStyle = "rgba(0,0,0,.42)";
        x.beginPath(); x.ellipse(0, 16, plateau.rx + 15, plateau.ry + 20, 0, 0, Math.PI * 2); x.fill();
        const gradient = x.createRadialGradient(-55, -55, 12, 0, 0, plateau.rx);
        gradient.addColorStop(0, "#746957");
        gradient.addColorStop(.68, "#48443b");
        gradient.addColorStop(1, "#1b2422");
        x.fillStyle = gradient;
        x.strokeStyle = "rgba(176, 160, 126, .5)";
        x.lineWidth = 8;
        x.beginPath(); x.ellipse(0, 0, plateau.rx, plateau.ry, 0, .25, Math.PI * 2 - .25); x.stroke(); x.fill();
        x.strokeStyle = "rgba(14, 19, 18, .9)";
        x.lineWidth = 15;
        x.beginPath(); x.moveTo(-plateau.rx - 12, 0); x.lineTo(-plateau.rx + 54, 0); x.stroke();
        x.beginPath(); x.moveTo(plateau.rx - 54, 0); x.lineTo(plateau.rx + 12, 0); x.stroke();
      }
      x.restore();
      if (tutorialsEnabled) {
        x.save();
        x.textAlign = "center";
        x.font = "800 9px system-ui";
        x.fillStyle = "rgba(246, 211, 102, .82)";
        x.fillText("ELEVATED · +10% DMG", plateau.x, plateau.y - 8);
        x.font = "700 7px system-ui";
        x.fillStyle = "rgba(227, 241, 234, .62)";
        x.fillText("2 RAMP ACCESS", plateau.x, plateau.y + 5);
        for (const ramp of plateau.ramps) {
          const localX = Math.cos(ramp) * plateau.rx * .86;
          const localY = Math.sin(ramp) * plateau.ry * .86;
          const c = Math.cos(plateau.rotation), s = Math.sin(plateau.rotation);
          const rx = plateau.x + localX * c - localY * s;
          const ry = plateau.y + localX * s + localY * c;
          x.strokeStyle = "rgba(246, 211, 102, .78)";
          x.lineWidth = 3;
          x.beginPath(); x.arc(rx, ry, 13, 0, Math.PI * 2); x.stroke();
        }
        x.restore();
      }
    }
    // Friendly supply sources project a quiet ground boundary instead of a
    // text label. Overlapping rings show how deployed structures extend the
    // supported base network.
    x.save();
    x.strokeStyle = "rgba(85, 214, 181, .36)";
    x.fillStyle = "rgba(85, 214, 181, .025)";
    x.lineWidth = 2;
    x.setLineDash([18, 13]);
    x.lineDashOffset = -(g.time * 7) % 31;
    x.shadowColor = "rgba(85, 214, 181, .4)";
    x.shadowBlur = 5;
    for (const source of g.buildings.filter(
      (building) => building.team === "player" && building.type !== "turret" && buildingOperational(building),
    )) {
      x.beginPath();
      x.arc(source.x, source.y, SUPPLY_RADIUS, 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
    x.restore();
    const selectedResourceWorker = g.units.find((unit) =>
      unit.team === "player" && unit.type === "worker" && g.selected.includes(unit.id));
    const closestResourceIndex = selectedResourceWorker
      ? g.crystals.reduce((best, node, index) => {
          if (node.amount <= 0) return best;
          if (best < 0) return index;
          const currentDistance = Math.hypot(node.x - selectedResourceWorker.x, node.y - selectedResourceWorker.y);
          const bestNode = g.crystals[best];
          return currentDistance < Math.hypot(bestNode.x - selectedResourceWorker.x, bestNode.y - selectedResourceWorker.y) ? index : best;
        }, -1)
      : -1;
    for (const [resourceIndex, q] of g.crystals.entries()) {
      const kind = q.kind || "credits";
      if (q.amount > 0 && art.current.crystal) {
        x.save();
        if (kind === "alloy") x.filter = "sepia(1) saturate(2.4) hue-rotate(345deg) brightness(1.08)";
        x.drawImage(art.current.crystal, q.x - 34, q.y - 38, 68, 68);
        x.restore();
      } else if (q.amount > 0) {
        x.shadowColor = "#74f6dc";
        x.shadowBlur = 14;
        x.fillStyle = kind === "alloy" ? "#e6a94f" : "#41d8c0";
        for (let i = 0; i < 5; i++) {
          x.beginPath();
          x.moveTo(q.x - 18 + i * 8, q.y + 15);
          x.lineTo(q.x - 12 + i * 8, q.y - 12 - (i % 2) * 12);
          x.lineTo(q.x - 4 + i * 8, q.y + 15);
          x.fill();
        }
        x.shadowBlur = 0;
      }
      if (resourceIndex === closestResourceIndex && q.amount > 0) {
        x.save();
        const label = `${kind === "alloy" ? "ALLOY" : "CREDITS"} · ${Math.ceil(q.amount)}`;
        const labelY = q.y + 39 + (resourceIndex % 2) * 11;
        x.textAlign = "center";
        x.font = "800 8px system-ui";
        const labelWidth = x.measureText(label).width + 12;
        x.fillStyle = "rgba(3, 13, 15, .82)";
        x.fillRect(q.x - labelWidth / 2, labelY - 10, labelWidth, 14);
        x.fillStyle = kind === "alloy" ? "#ffd58a" : "#9cf8ea";
        x.fillText(label, q.x, labelY);
        x.restore();
      }
    }
    const constructionQueueBadges = new Map<number, { order: number; color: string }[]>();
    const selectedBuildWorkers = g.units.filter((unit) =>
      unit.team === "player" &&
      unit.type === "worker" &&
      g.selected.includes(unit.id) &&
      (unit.buildQueue?.length || unit.buildTarget),
    );
    const groupedBuildRoutes = new Map<string, { workers: Unit[]; sites: Building[] }>();
    for (const worker of selectedBuildWorkers) {
      const queue = worker.buildQueue || (worker.buildTarget ? [worker.buildTarget] : []);
      const sites = queue
        .map((buildingId) => g.buildings.find((building) =>
          building.id === buildingId && building.team === worker.team && building.hp > 0 && (building.progress ?? 1) < 1,
        ))
        .filter((building): building is Building => Boolean(building));
      if (!sites.length) continue;
      const signature = sites.map((site) => site.id).join("-");
      const route = groupedBuildRoutes.get(signature);
      if (route) route.workers.push(worker);
      else groupedBuildRoutes.set(signature, { workers: [worker], sites });
    }
    const routeColors = ["#6ae1cd", "#f6d366", "#78c9ff"];
    [...groupedBuildRoutes.values()].forEach((route, routeIndex) => {
      const color = routeColors[routeIndex % routeColors.length];
      route.sites.forEach((site, siteIndex) => {
        const badges = constructionQueueBadges.get(site.id) || [];
        badges.push({ order: siteIndex + 1, color });
        constructionQueueBadges.set(site.id, badges);
      });
      x.save();
      x.strokeStyle = color;
      x.fillStyle = color;
      x.globalAlpha = .72;
      x.lineWidth = 2;
      x.setLineDash([9, 7]);
      x.lineDashOffset = -(g.time * 18) % 16;
      for (const worker of route.workers) {
        x.beginPath();
        x.moveTo(worker.x, worker.y);
        x.lineTo(route.sites[0].x, route.sites[0].y);
        x.stroke();
      }
      if (route.sites.length > 1) {
        x.beginPath();
        x.moveTo(route.sites[0].x, route.sites[0].y);
        route.sites.slice(1).forEach((site) => x.lineTo(site.x, site.y));
        x.stroke();
      }
      x.setLineDash([]);
      route.sites.forEach((site) => {
        x.beginPath();
        x.arc(site.x, site.y, 6, 0, Math.PI * 2);
        x.fill();
      });
      x.restore();
    });
    for (const objective of g.objectives || []) {
      const intel = objectiveIntel(g, objective);
      if (!intel.discovered) continue;
      const color = !intel.visible ? "#78918c" : objective.owner === "player" ? "#57d7c0" : objective.owner === "enemy" ? "#ef526f" : "#f5d77a";
      const progress = Math.min(1, Math.abs(objective.capture) / OBJECTIVE_CAPTURE_TIME);
      x.save();
      x.translate(objective.x, objective.y);
      x.fillStyle = "rgba(4, 13, 15, .82)";
      x.strokeStyle = color;
      x.lineWidth = 4;
      x.beginPath(); x.arc(0, 0, 34, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = color;
      x.fillRect(-5, -22, 10, 32);
      x.beginPath(); x.arc(0, -25, 9, 0, Math.PI * 2); x.fill();
      x.globalAlpha = .25;
      x.beginPath(); x.arc(0, 0, 72, 0, Math.PI * 2); x.stroke();
      x.globalAlpha = 1;
      if (intel.visible) {
        x.strokeStyle = color;
        x.lineWidth = 6;
        x.beginPath(); x.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); x.stroke();
      }
      const objectiveLabel = !intel.visible ? "UPLINK · LAST KNOWN" : objective.owner === "neutral" ? "INTEL UPLINK" : `${objective.owner.toUpperCase()} UPLINK`;
      x.textAlign = "center";
      x.font = "800 10px system-ui";
      const objectiveLabelWidth = x.measureText(objectiveLabel).width + 16;
      x.fillStyle = "rgba(3, 13, 15, .86)";
      x.fillRect(-objectiveLabelWidth / 2, 53, objectiveLabelWidth, 18);
      x.fillStyle = "#effbf7";
      x.fillText(objectiveLabel, 0, 66);
      x.restore();
    }
    for (const b of g.buildings) {
      if (b.team === "enemy" && !isVisible(g, b, buildingStats[b.type].r)) continue;
      const r = buildingStats[b.type].r,
        sel = g.selected.includes(b.id),
        player = b.team === "player",
        accent = player ? "#57d7c0" : "#ef526f",
        underConstruction = b.progress !== undefined && b.progress < 1;
      x.save();
      if (sel && b.type !== "turret" && buildingOperational(b)) {
        x.strokeStyle = "rgba(87, 215, 192, .22)";
        x.lineWidth = 2;
        x.setLineDash([12, 10]);
        x.beginPath();
        x.arc(b.x, b.y, SUPPLY_RADIUS, 0, Math.PI * 2);
        x.stroke();
        x.setLineDash([]);
      }
      x.translate(b.x, b.y);
      x.fillStyle = underConstruction ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.22)";
      x.shadowBlur = 0;
      x.beginPath(); x.ellipse(0, r * .42, r * .86, r * .16, 0, 0, Math.PI * 2); x.fill();
      x.shadowColor = "rgba(0,0,0,.45)";
      x.shadowBlur = sel ? 8 : 0;
      x.fillStyle = player ? "#12383b" : "#3a1d2b";
      x.strokeStyle = sel ? "#f5d77a" : "#251b1b";
      x.lineWidth = sel ? 4 : 2;
      const buildingAtlas = art.current.buildings;
      const crawlerAtlas = b.type === "hq" && b.packed ? art.current.commandCrawler : undefined;
      const turretAtlas = b.type === "turret"
        ? ((b.turretFireUntil || 0) > g.time
            ? art.current.turretFire || art.current.turretDirections
            : art.current.turretDirections)
        : undefined;
      if (underConstruction) {
        x.globalAlpha = b.constructionStarted ? Math.max(.2, b.progress * .78) : .14;
        x.filter = "grayscale(.55) brightness(1.25)";
      }
      if (buildingAtlas || turretAtlas || crawlerAtlas) {
        if (sel) {
          x.shadowBlur = 0;
          x.strokeStyle = "#f5d77a";
          x.lineWidth = 3;
          x.beginPath();
          x.ellipse(0, r * .45, r * 1.12, r * .52, 0, 0, Math.PI * 2);
          x.stroke();
        }
        const size = crawlerAtlas
          ? { w: 174, h: 145 }
          : turretAtlas
          ? { w: 110, h: 108 }
          : b.type === "hq"
            ? { w: 142, h: 118 }
            : b.type === "barracks"
              ? { w: 116, h: 96 }
              : b.type === "refinery"
                ? { w: 110, h: 92 }
                : { w: 82, h: 80 };
        x.shadowBlur = 0;
        if (crawlerAtlas) {
          x.drawImage(crawlerAtlas, -size.w / 2, -size.h / 2, size.w, size.h);
        } else if (turretAtlas) {
          const sw = turretAtlas.naturalWidth / 4;
          const sh = turretAtlas.naturalHeight / 2;
          const angle = Number.isFinite(b.turretFacing) ? b.turretFacing! : -Math.PI / 2;
          const direction = ((Math.round((angle + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
          x.drawImage(
            turretAtlas,
            (direction % 4) * sw,
            Math.floor(direction / 4) * sh,
            sw,
            sh,
            -size.w / 2,
            -size.h / 2,
            size.w,
            size.h,
          );
        } else if (buildingAtlas) {
          const frame = { hq: 0, refinery: 1, barracks: 2, turret: 3 }[b.type];
          const sw = buildingAtlas.naturalWidth / 2;
          const sh = buildingAtlas.naturalHeight / 2;
          x.drawImage(
            buildingAtlas,
            (frame % 2) * sw,
            Math.floor(frame / 2) * sh,
            sw,
            sh,
            -size.w / 2,
            -size.h / 2,
            size.w,
            size.h,
          );
        }
        // Team colors stay crisp and consistent even though both factions use
        // the same painted base sprite.
        x.fillStyle = accent;
        x.shadowColor = accent;
        x.shadowBlur = 4;
        x.fillRect(-r * .34, r * .42, r * .68, 4);
        x.beginPath();
        x.arc(0, -r * .44, 3, 0, Math.PI * 2);
        x.fill();
        x.shadowBlur = 0;
      } else if (b.type === "hq") {
        x.beginPath();
        x.moveTo(0, -r);
        x.lineTo(r * 0.82, -r * 0.45);
        x.lineTo(r * 0.82, r * 0.55);
        x.lineTo(0, r);
        x.lineTo(-r * 0.82, r * 0.55);
        x.lineTo(-r * 0.82, -r * 0.45);
        x.closePath();
        x.fill();
        x.stroke();
        x.fillStyle = accent;
        x.fillRect(-8, -r * 0.52, 16, r * 1.04);
        x.fillRect(-r * 0.45, -8, r * 0.9, 16);
        x.fillStyle = "rgba(225,246,236,.72)";
        x.fillRect(-3, -r * .7, 6, r * .25);
        x.fillRect(-r * .7, -3, r * .25, 6);
      } else if (b.type === "barracks") {
        x.fillRect(-r * 0.8, -r * 0.58, r * 1.6, r * 1.16);
        x.strokeRect(-r * 0.8, -r * 0.58, r * 1.6, r * 1.16);
        x.fillStyle = accent;
        x.fillRect(-r * 0.55, -r * 0.3, r * 1.1, 7);
        x.fillRect(-r * 0.55, r * 0.1, r * 1.1, 7);
        x.fillStyle = "#0a1b1c";
        x.fillRect(-r * 0.2, r * 0.32, r * 0.4, r * 0.28);
      } else if (b.type === "turret") {
        x.fillRect(-r * .58, -r * .32, r * 1.16, r * .86);
        x.strokeRect(-r * .58, -r * .32, r * 1.16, r * .86);
        x.fillStyle = "#081b1d";
        x.beginPath(); x.arc(0, -r * .33, r * .42, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = accent;
        x.fillRect(-3, -r * 1.12, 6, r * .85);
        x.fillRect(0, -r * 1.02, r * .8, 5);
        x.fillStyle = "#dff8f0";
        x.fillRect(r * .72, -r * 1.05, 6, 7);
      } else {
        x.beginPath();
        x.arc(0, 0, r * 0.72, 0, 7);
        x.fill();
        x.stroke();
        x.strokeStyle = accent;
        x.lineWidth = 5;
        x.beginPath();
        x.arc(0, 0, r * 0.43, 0, 7);
        x.stroke();
        x.fillStyle = accent;
        x.fillRect(-5, -r * 0.75, 10, r * 0.35);
      }
      if (underConstruction) {
        x.globalAlpha = 1;
        x.filter = "none";
        x.shadowBlur = 0;
        x.strokeStyle = b.constructionStarted ? "rgba(246, 211, 102, .9)" : "rgba(106, 225, 205, .82)";
        x.lineWidth = 2;
        x.setLineDash([6, 5]);
        x.strokeRect(-r * .95, -r * .78, r * 1.9, r * 1.56);
        x.beginPath();
        x.moveTo(-r * .95, -r * .78); x.lineTo(r * .95, r * .78);
        x.moveTo(r * .95, -r * .78); x.lineTo(-r * .95, r * .78);
        x.moveTo(0, -r * .98); x.lineTo(0, r * .98);
        x.stroke();
        x.setLineDash([]);
      }
      if (b.type === "hq" && b.relocation) {
        const progress = Math.max(0, Math.min(1, b.relocation.elapsed / b.relocation.duration));
        x.globalAlpha = 1;
        x.filter = "none";
        x.strokeStyle = "rgba(246, 211, 102, .22)";
        x.lineWidth = 7;
        x.beginPath(); x.arc(0, 0, r + 20, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = "#f6d366";
        x.beginPath(); x.arc(0, 0, r + 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); x.stroke();
        x.fillStyle = "rgba(2, 10, 12, .88)";
        x.fillRect(-52, r + 28, 104, 18);
        x.fillStyle = "#f6d366";
        x.textAlign = "center";
        x.font = "800 9px system-ui";
        x.fillText(b.relocation.mode === "pack" ? "PACKING HQ" : "DEPLOYING HQ", 0, r + 40);
      } else if (b.type === "hq" && b.packed) {
        x.fillStyle = "rgba(2, 10, 12, .88)";
        x.fillRect(-58, r + 24, 116, 18);
        x.fillStyle = accent;
        x.textAlign = "center";
        x.font = "800 9px system-ui";
        x.fillText(b.mobileTarget ? "CRAWLER MOVING · 12" : "COMMAND CRAWLER", 0, r + 36);
      }
      x.restore();
      bar(x, b.x - r, b.y - r - 13, r * 2, b.hp / b.max, accent);
      if (b.rally) {
        x.save();
        x.strokeStyle = player ? "#f6d366" : "#f05b76";
        x.setLineDash([5, 5]);
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(b.x, b.y);
        x.lineTo(b.rally.x, b.rally.y);
        x.stroke();
        x.setLineDash([]);
        x.beginPath();
        x.arc(b.rally.x, b.rally.y, 11, 0, Math.PI * 2);
        x.stroke();
        x.restore();
      }
      if (b.production) {
        const p = Math.min(1, b.production.elapsed / b.production.duration);
        bar(x, b.x - r, b.y - r - 23, r * 2, p, "#f6d366");
        x.fillStyle = "#f6d366";
        x.font = "800 8px system-ui";
        x.fillText(
          `${unitName(b.production.type)} ${Math.max(0, Math.ceil(b.production.duration - b.production.elapsed))}s${b.production.queue?.length ? ` · +${b.production.queue.length}` : ""}`,
          b.x,
          b.y - r - 28,
        );
      }
      if (b.progress !== undefined && b.progress < 1) {
        x.strokeStyle = b.constructionStarted ? "#f6d366" : "#6ae1cd";
        x.lineWidth = 2;
        x.setLineDash(b.constructionStarted ? [] : [5, 4]);
        x.beginPath();
        x.arc(
          b.x,
          b.y,
          r + 8,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * b.progress,
        );
        x.stroke();
        x.setLineDash([]);
        const seconds = Math.max(
          0,
          Math.ceil((b.constructionDuration || 6) * (1 - b.progress)),
        );
        x.fillStyle = b.constructionStarted ? "#f6d366" : "#8cf5e2";
        x.font = "800 8px system-ui";
        x.fillText(b.constructionStarted ? `BUILDING · ${seconds}s` : "WIREFRAME · WAITING FOR WORKER", b.x, b.y + r + 17);
      }
      const queueBadges = constructionQueueBadges.get(b.id) || [];
      queueBadges.forEach((badge, badgeIndex) => {
        const badgeX = b.x + r + 9 + badgeIndex * 23;
        const badgeY = b.y - r - 8;
        x.save();
        x.shadowColor = badge.color;
        x.shadowBlur = 8;
        x.fillStyle = "rgba(3, 13, 15, .94)";
        x.strokeStyle = badge.color;
        x.lineWidth = 2;
        x.beginPath();
        x.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.shadowBlur = 0;
        x.fillStyle = "#f4fffb";
        x.font = "900 10px system-ui";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(String(badge.order), badgeX, badgeY + .5);
        x.restore();
      });
      if (b.type === "hq" && b.team === "player" && g.fortifyProduction) {
        const p = Math.min(1, g.fortifyProduction.elapsed / g.fortifyProduction.duration);
        x.strokeStyle = "#f6d366";
        x.lineWidth = 3;
        x.beginPath();
        x.arc(b.x, b.y, r + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        x.stroke();
        x.fillStyle = "#f6d366";
        x.font = "800 8px system-ui";
        x.fillText(`FORTIFY · ${Math.max(0, Math.ceil(g.fortifyProduction.duration - g.fortifyProduction.elapsed))}s`, b.x, b.y + r + 28);
      }
      if (b.type === "hq" && b.team === "player" && g.doctrineProduction) {
        const p = Math.min(1, g.doctrineProduction.elapsed / g.doctrineProduction.duration);
        x.strokeStyle = "#78c9ff";
        x.lineWidth = 3;
        x.beginPath();
        x.arc(b.x, b.y, r + 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        x.stroke();
        x.fillStyle = "#9ed9ff";
        x.font = "800 8px system-ui";
        x.fillText(`${g.doctrineProduction.type === "air" ? "AIR" : "ARMOR"} DOCTRINE · ${Math.max(0, Math.ceil(g.doctrineProduction.duration - g.doctrineProduction.elapsed))}s`, b.x, b.y + r + 28);
      }
    }
    const selectedTravelers = g.units.filter((unit) =>
      unit.team === "player" &&
      unit.type !== "worker" &&
      g.selected.includes(unit.id) &&
      unit.target &&
      !unit.retreating &&
      !unit.patrol,
    );
    for (const engage of [false, true]) {
      const travelers = selectedTravelers.filter((unit) => Boolean(unit.moveEngage) === engage);
      if (!travelers.length) continue;
      const color = engage ? "#55d6b5" : "#f6d366";
      const goal = travelers.reduce(
        (sum, unit) => ({ x: sum.x + unit.target!.x, y: sum.y + unit.target!.y }),
        { x: 0, y: 0 },
      );
      goal.x /= travelers.length;
      goal.y /= travelers.length;
      const pulse = 1 + Math.sin(g.time * 5) * .08;
      x.save();
      x.strokeStyle = color;
      x.fillStyle = color;
      x.lineWidth = 2;
      x.globalAlpha = .66;
      x.setLineDash([8, 7]);
      x.lineDashOffset = -(g.time * 16) % 15;
      for (const unit of travelers) {
        x.beginPath();
        x.moveTo(unit.x, unit.y);
        x.lineTo(unit.target!.x, unit.target!.y);
        x.stroke();
      }
      x.setLineDash([]);
      x.globalAlpha = .96;
      x.shadowColor = color;
      x.shadowBlur = 12;
      x.beginPath();
      x.arc(goal.x, goal.y, 18 * pulse, 0, Math.PI * 2);
      x.stroke();
      x.shadowBlur = 0;
      x.beginPath();
      x.moveTo(goal.x - 25, goal.y); x.lineTo(goal.x - 8, goal.y);
      x.moveTo(goal.x + 8, goal.y); x.lineTo(goal.x + 25, goal.y);
      x.moveTo(goal.x, goal.y - 25); x.lineTo(goal.x, goal.y - 8);
      x.moveTo(goal.x, goal.y + 8); x.lineTo(goal.x, goal.y + 25);
      x.stroke();
      const label = engage ? "MOVE + ENGAGE" : "DIRECT MOVE";
      x.font = "900 8px system-ui";
      x.textAlign = "center";
      const labelWidth = x.measureText(label).width + 14;
      x.fillStyle = "rgba(3, 15, 17, .9)";
      x.fillRect(goal.x - labelWidth / 2, goal.y + 30, labelWidth, 16);
      x.fillStyle = color;
      x.fillText(label, goal.x, goal.y + 41);
      x.restore();
    }
    for (const u of g.units) {
      if (u.team === "enemy" && !isVisible(g, u, stats[u.type].r)) continue;
      const s = stats[u.type],
        sel = g.selected.includes(u.id),
        player = u.team === "player",
        accent = player ? "#70e2ce" : "#f05b76",
        sentryMode = u.type !== "worker" && u.stance === "hold";
      if (sel) {
        x.save();
        x.strokeStyle = "rgba(246, 211, 102, .78)";
        x.fillStyle = "rgba(246, 211, 102, .025)";
        x.lineWidth = 2;
        x.setLineDash([7, 6]);
        x.shadowColor = "rgba(246, 211, 102, .45)";
        x.shadowBlur = 5;
        x.beginPath();
        x.arc(u.x, u.y, unitCombatRange(u), 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.restore();
      }
      x.save();
      x.translate(u.x, u.y + (u.type === "drone" && !sentryMode ? Math.sin(g.time * 5 + u.id) * 2 - 7 : 0));
      x.fillStyle = "rgba(0,0,0,.26)";
      x.shadowBlur = 0;
      x.beginPath(); x.ellipse(0, s.r * .5, s.r * 1.08, s.r * .22, 0, 0, Math.PI * 2); x.fill();
      x.shadowColor = "rgba(0,0,0,.55)";
      x.shadowBlur = sel ? 7 : 0;
      x.fillStyle = accent;
      x.strokeStyle = sel ? "#ffe17d" : "#081314";
      x.lineWidth = sel ? 3 : 2;
      const restingAtlas = {
        worker: art.current.workerDirections,
        trooper: art.current.trooperDirections,
        tank: art.current.tankDirections,
        drone: art.current.droneDirections,
      }[u.type];
      const movementAtlases = {
        worker: [restingAtlas, art.current.workerWalk, art.current.workerWalkC],
        trooper: [restingAtlas, art.current.trooperWalk, art.current.trooperWalkC],
        tank: [restingAtlas, art.current.tankMove, art.current.tankMoveC],
        drone: [restingAtlas, art.current.droneMove],
      }[u.type].filter((atlas): atlas is HTMLImageElement => Boolean(atlas));
      const attackAtlas = {
        worker: undefined,
        trooper: art.current.trooperFire,
        tank: art.current.tankFire,
        drone: art.current.droneDirections,
      }[u.type];
      const firing = (u.attackUntil || 0) > g.time;
      const miningFrame = Boolean(u.mining) && Math.floor((g.time + u.id * .041) * 8) % 2 === 1;
      const movementFrame = Math.floor((g.time + u.id * .037) * (u.type === "tank" ? 6 : 8)) % Math.max(1, movementAtlases.length);
      const directionalAtlas = sentryMode
        ? (firing ? art.current.turretFire : art.current.turretDirections) || restingAtlas
        : firing
          ? attackAtlas || restingAtlas
          : miningFrame
            ? art.current.workerMine || restingAtlas
            : u.moving
              ? movementAtlases[movementFrame] || restingAtlas
              : restingAtlas;
      const unitAtlas = directionalAtlas || art.current.units;
      if (unitAtlas) {
        if (sel) {
          x.shadowBlur = 0;
          x.strokeStyle = "#ffe17d";
          x.lineWidth = 2.5;
          x.beginPath();
          x.ellipse(0, s.r * .48, s.r * 1.18, s.r * .52, 0, 0, Math.PI * 2);
          x.stroke();
        }
        let source: { x: number; y: number; w: number; h: number };
        if (directionalAtlas) {
          const cellWidth = unitAtlas.naturalWidth / 4;
          const cellHeight = unitAtlas.naturalHeight / 2;
          const angle = Number.isFinite(u.facing)
            ? u.facing!
            : u.team === "player" ? 0 : Math.PI;
          // Sheet order: N, NE, E, SE / S, SW, W, NW.
          const direction = ((Math.round((angle + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
          source = {
            x: (direction % 4) * cellWidth,
            y: Math.floor(direction / 4) * cellHeight,
            w: cellWidth,
            h: cellHeight,
          };
        } else {
          const heading = u.target
            ? Math.atan2(u.target.y - u.y, u.target.x - u.x) + Math.PI / 2
            : 0;
          x.rotate(heading);
          const cellWidth = unitAtlas.naturalWidth / 3;
          source = {
            worker: { x: 0, y: unitAtlas.naturalHeight * .27, w: cellWidth, h: unitAtlas.naturalHeight * .45 },
            trooper: { x: cellWidth, y: unitAtlas.naturalHeight * .27, w: cellWidth, h: unitAtlas.naturalHeight * .45 },
            tank: { x: cellWidth * 2, y: unitAtlas.naturalHeight * .27, w: cellWidth, h: unitAtlas.naturalHeight * .45 },
            drone: { x: cellWidth * 2, y: unitAtlas.naturalHeight * .27, w: cellWidth, h: unitAtlas.naturalHeight * .45 },
          }[u.type];
        }
        const size = directionalAtlas
          ? sentryMode
            ? u.type === "tank" ? { w: 88, h: 88 } : u.type === "drone" ? { w: 78, h: 78 } : { w: 70, h: 70 }
            : u.type === "tank"
            ? { w: 90, h: 90 }
            : u.type === "drone"
              ? { w: 88, h: 72 }
            : u.type === "trooper"
              ? { w: 68, h: 68 }
              : { w: 66, h: 66 }
          : u.type === "tank"
            ? { w: 84, h: 82 }
            : u.type === "drone"
              ? { w: 84, h: 70 }
            : u.type === "trooper"
              ? { w: 62, h: 68 }
              : { w: 54, h: 60 };
        x.shadowBlur = 0;
        if (sentryMode) {
          x.save();
          x.strokeStyle = player ? "rgba(112, 226, 206, .88)" : "rgba(240, 91, 118, .86)";
          x.fillStyle = "rgba(5, 18, 20, .78)";
          x.lineWidth = 2;
          x.shadowColor = accent;
          x.shadowBlur = 8;
          x.beginPath();
          x.ellipse(0, 14, 25, 10, 0, 0, Math.PI * 2);
          x.fill();
          x.stroke();
          for (const braceAngle of [-Math.PI / 6, Math.PI / 2, Math.PI * 7 / 6]) {
            x.beginPath();
            x.moveTo(Math.cos(braceAngle) * 15, 13 + Math.sin(braceAngle) * 5);
            x.lineTo(Math.cos(braceAngle) * 31, 16 + Math.sin(braceAngle) * 12);
            x.stroke();
          }
          x.restore();
        }
        x.drawImage(
          unitAtlas,
          source.x,
          source.y,
          source.w,
          source.h,
          -size.w / 2,
          -size.h / 2,
          size.w,
          size.h,
        );
        x.fillStyle = accent;
        x.shadowColor = accent;
        x.shadowBlur = 3;
        x.fillRect(-s.r * .42, s.r * .43, s.r * .84, 3);
        x.shadowBlur = 0;
        if (u.type === "worker" && (u.building || u.repairing)) {
          const phase = g.time * 15 + u.id;
          const effectColor = u.building ? "#f6d366" : "#70e2ce";
          const toolX = Math.cos(u.facing || 0) * 22;
          const toolY = Math.sin(u.facing || 0) * 22;
          x.save();
          x.strokeStyle = effectColor;
          x.fillStyle = effectColor;
          x.lineWidth = 2.4;
          x.shadowColor = effectColor;
          x.shadowBlur = 8;
          x.beginPath();
          x.moveTo(Math.cos(u.facing || 0) * 7, Math.sin(u.facing || 0) * 7);
          x.lineTo(toolX, toolY);
          x.stroke();
          for (let spark = 0; spark < 4; spark++) {
            const angle = phase + spark * Math.PI / 2;
            const radius = 4 + ((spark + Math.floor(g.time * 12)) % 3) * 2;
            x.beginPath();
            x.arc(toolX + Math.cos(angle) * radius, toolY + Math.sin(angle) * radius, 1.5, 0, Math.PI * 2);
            x.fill();
          }
          x.restore();
        }
      } else if (u.type === "tank") {
        x.fillRect(-s.r, -s.r * .62, s.r * 2, s.r * 1.24);
        x.strokeRect(-s.r, -s.r * .62, s.r * 2, s.r * 1.24);
        x.fillStyle = "#102629";
        x.fillRect(-s.r * .72, -s.r * .8, 7, s.r * 1.6);
        x.fillRect(s.r * .55, -s.r * .8, 7, s.r * 1.6);
        x.fillStyle = "#d5f4e9"; x.fillRect(0, -3, s.r + 13, 6);
        x.fillStyle = accent; x.beginPath(); x.arc(-s.r * .55, 0, 3, 0, 7); x.arc(s.r * .55, 0, 3, 0, 7); x.fill();
      } else if (u.type === "trooper") {
        x.beginPath(); x.moveTo(0, -s.r); x.lineTo(s.r * .8, s.r * .55); x.lineTo(0, s.r); x.lineTo(-s.r * .8, s.r * .55); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = "#d5f4e9"; x.fillRect(-3, -s.r * .38, 6, 7);
      } else {
        x.beginPath();
        x.arc(0, 0, s.r * 0.82, 0, 7);
        x.fill();
        x.stroke();
        x.fillStyle = "#d5f4e9";
        x.fillRect(3, -3, 10, 6);
      }
      x.restore();
      bar(
        x,
        u.x - s.r,
        u.y - s.r - 9,
        s.r * 2,
        u.hp / u.max,
        player ? "#55d6b5" : "#ed526d",
      );
      if ((u.level || 1) > 1) {
        x.fillStyle = "#f6d366";
        x.font = "900 9px system-ui";
        x.textAlign = "center";
        x.fillText((u.level || 1) === 3 ? "◆◆" : "◆", u.x, u.y - s.r - 14);
      }
      if (unitInSupplyRange(g, u)) {
        const shieldX = u.x + s.r + 4;
        const shieldY = u.y - s.r - 4;
        x.save();
        x.translate(shieldX, shieldY);
        x.fillStyle = player ? "rgba(85, 214, 181, .74)" : "rgba(237, 82, 109, .72)";
        x.strokeStyle = player ? "#b8fff0" : "#ffc1cc";
        x.lineWidth = 1.3;
        x.shadowColor = player ? "#55d6b5" : "#ed526d";
        x.shadowBlur = 6;
        x.beginPath();
        x.moveTo(0, -7);
        x.lineTo(6, -4);
        x.lineTo(5, 3);
        x.quadraticCurveTo(3, 7, 0, 9);
        x.quadraticCurveTo(-3, 7, -5, 3);
        x.lineTo(-6, -4);
        x.closePath();
        x.fill();
        x.stroke();
        x.restore();
      }
    }
    for (const s of g.shots || []) {
      const p = 1 - s.life / s.maxLife,
        px = s.x + (s.tx - s.x) * p,
        py = s.y + (s.ty - s.y) * p;
      if (!isVisible(g, { x: px, y: py }, 12)) continue;
      x.save();
      x.strokeStyle = s.team === "player" ? "#ffe17d" : "#ff7690";
      x.fillStyle = x.strokeStyle;
      x.shadowColor = x.strokeStyle;
      x.shadowBlur = s.kind === "shell" ? 10 : 5;
      if (s.kind === "shell") {
        x.beginPath();
        x.arc(px, py, 4, 0, Math.PI * 2);
        x.fill();
      } else {
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(px - (s.tx - s.x) * 0.035, py - (s.ty - s.y) * 0.035);
        x.lineTo(px, py);
        x.stroke();
      }
      x.restore();
    }
    for (const n of g.damageNumbers || []) {
      if (!isVisible(g, n, 18)) continue;
      x.save();
      x.globalAlpha = Math.min(1, n.life * 2);
      x.fillStyle = n.team === "player" ? "#ffe17d" : "#ff8496";
      x.strokeStyle = "#071719";
      x.lineWidth = 3;
      x.font = "900 13px system-ui";
      x.textAlign = "center";
      x.strokeText(`-${n.amount}`, n.x, n.y);
      x.fillText(`-${n.amount}`, n.x, n.y);
      x.restore();
    }
    // Real RTS fog: black is unexplored, grey is explored but currently out
    // of sight, and enemies are only drawn while a player source can see them.
    // Paint only the shroud cells.  Do not erase holes from the canvas here:
    // destination-out would also erase the terrain and friendly units drawn
    // underneath, leaving the page background visible instead of the game.
    if (g.fogEnabled) {
      const vision = playerVision(g);
      x.save();
      for (let row = 0; row < FOG_ROWS; row++)
        for (let col = 0; col < FOG_COLS; col++) {
          const index = row * FOG_COLS + col;
          const cx = col * FOG_CELL + FOG_CELL / 2;
          const cy = row * FOG_CELL + FOG_CELL / 2;
          const currentlyVisible = vision.some(
            (v) => Math.hypot(v.x - cx, v.y - cy) <= v.r + FOG_CELL * 0.9,
          );
          if (currentlyVisible) continue;
          x.fillStyle = g.fogSeen[index]
            ? "rgba(2, 8, 12, .72)"
            : "rgba(2, 6, 9, .98)";
          x.fillRect(col * FOG_CELL, row * FOG_CELL, FOG_CELL + 1, FOG_CELL + 1);
        }
      x.restore();
    }
    if (pointer.current?.drag) {
      const p = pointer.current,
        now = screenToWorld(p.x, p.y);
      x.fillStyle = "rgba(85,214,181,.12)";
      x.strokeStyle = "#55d6b5";
      x.fillRect(p.wx, p.wy, now.x - p.wx, now.y - p.wy);
      x.strokeRect(p.wx, p.wy, now.x - p.wx, now.y - p.wy);
    }
    x.restore();
    // minimap
    const mw = 132,
      mh = 82,
      mx = w - mw - 12,
      my = 12;
    x.fillStyle = "rgba(2,6,8,.98)";
    x.fillRect(mx, my, mw, mh);
    x.strokeStyle = "#335a59";
    x.strokeRect(mx, my, mw, mh);
    for (let row = 0; row < FOG_ROWS; row++)
      for (let col = 0; col < FOG_COLS; col++) {
        if (!g.fogSeen[row * FOG_COLS + col]) continue;
        x.fillStyle = "rgba(58, 112, 106, .38)";
        x.fillRect(mx + (col / FOG_COLS) * mw, my + (row / FOG_ROWS) * mh, mw / FOG_COLS + 1, mh / FOG_ROWS + 1);
      }
    x.fillStyle = "rgba(118, 126, 120, .72)";
    for (const ridge of TACTICAL_PLATEAUS) {
      x.beginPath();
      x.ellipse(mx + (ridge.x / W) * mw, my + (ridge.y / H) * mh, (ridge.rx / W) * mw, (ridge.ry / H) * mh, ridge.rotation, 0, Math.PI * 2);
      x.fill();
    }
    for (const o of [...g.buildings, ...g.units]) {
      if (o.team === "enemy" && !isVisible(g, o, 0)) continue;
      x.fillStyle = o.team === "player" ? "#55d6b5" : "#ed526d";
      x.fillRect(mx + (o.x / W) * mw - 2, my + (o.y / H) * mh - 2, 4, 4);
    }
    for (const objective of g.objectives || []) {
      const intel = objectiveIntel(g, objective);
      if (!intel.discovered) continue;
      x.fillStyle = !intel.visible ? "#78918c" : objective.owner === "player" ? "#55d6b5" : objective.owner === "enemy" ? "#ed526d" : "#f6d366";
      x.beginPath();
      x.arc(mx + (objective.x / W) * mw, my + (objective.y / H) * mh, 3, 0, Math.PI * 2);
      x.fill();
    }
    const activeAlerts = (g.attackAlerts || []).filter((alert) => alert.team === "player" && alert.expiresAt > g.time);
    for (const alert of activeAlerts) {
      const object = [...g.units, ...g.buildings].find((candidate) => candidate.id === alert.targetId && candidate.team === "player");
      const ax = mx + (((object?.x ?? alert.x) / W) * mw);
      const ay = my + (((object?.y ?? alert.y) / H) * mh);
      const pulse = 7 + (Math.sin((g.time - alert.startedAt) * 10) + 1) * 2.5;
      x.save();
      x.strokeStyle = "#ff3657";
      x.lineWidth = 2;
      x.shadowColor = "#ff183f";
      x.shadowBlur = 8;
      x.globalAlpha = .7 + Math.sin((g.time - alert.startedAt) * 12) * .25;
      x.strokeRect(ax - pulse / 2, ay - pulse / 2, pulse, pulse);
      x.restore();
    }
    x.strokeStyle = "#f6d366";
    x.strokeRect(
      mx + ((g.camera.x - w / (2 * g.zoom)) / W) * mw,
      my + ((g.camera.y - h / (2 * g.zoom)) / H) * mh,
      (w / g.zoom / W) * mw,
      (h / g.zoom / H) * mh,
    );
  }
  function bar(
    x: CanvasRenderingContext2D,
    bx: number,
    by: number,
    w: number,
    p: number,
    color: string,
  ) {
    x.fillStyle = "#061011";
    x.fillRect(bx, by, w, 4);
    x.fillStyle = color;
    x.fillRect(bx, by, w * Math.max(0, p), 4);
  }
  const commitTravelChoice = (world: P, choice: "engage" | "direct") => {
    const g = game.current;
    const combat = g.units.filter((unit) =>
      unit.team === "player" && unit.type !== "worker" && g.selected.includes(unit.id));
    setMoveChooser(null);
    if (!combat.length) {
      g.message = "Select Soldiers, Tanks, or Drones before issuing a travel order.";
      sync();
      return;
    }
    g.mode = choice === "engage" ? "move-engage" : "move";
    command(world.x, world.y);
  };
  const pd = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setMoveChooser(null);
    const r = canvas.current!.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top,
      wp = screenToWorld(sx, sy);
    if (e.pointerType === "touch") {
      touchPoints.current.set(e.pointerId, { x: sx, y: sy });
      if (touchPoints.current.size >= 2) {
        if (moveGesture.current?.timer) clearTimeout(moveGesture.current.timer);
        moveGesture.current = null;
        const [a, b] = [...touchPoints.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinch.current = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom: game.current.zoom,
          worldMid: screenToWorld(mid.x, mid.y),
        };
        pinchConsumed.current = true;
        pointer.current = null;
        canvas.current!.setPointerCapture(e.pointerId);
        return;
      }
    }
    pointer.current = {
      x: sx,
      y: sy,
      wx: wp.x,
      wy: wp.y,
      drag: false,
      start: { x: sx, y: sy },
    };
    canvas.current!.setPointerCapture(e.pointerId);
    const g = game.current;
    const hasSelectedCombat = g.units.some((unit) =>
      unit.team === "player" && unit.type !== "worker" && g.selected.includes(unit.id));
    const hitFriendly = [...g.units, ...g.buildings].some((object) =>
      object.team === "player" && Math.hypot(object.x - wp.x, object.y - wp.y) < 55);
    const mw = 132, mh = 82, mx = canvas.current!.clientWidth - mw - 12, my = 12;
    const overMinimap = sx >= mx && sx <= mx + mw && sy >= my && sy <= my + mh;
    if (g.mode === "select" && hasSelectedCombat && !hitFriendly && !overMinimap) {
      const gesture = {
        opened: false,
        start: { x: sx, y: sy },
        world: wp,
        choice: null as "engage" | "direct" | null,
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      };
      gesture.timer = setTimeout(() => {
        if (moveGesture.current !== gesture || pointer.current?.drag) return;
        gesture.opened = true;
        setMoveChooser({
          x: Math.max(112, Math.min(canvas.current!.clientWidth - 112, sx)),
          y: Math.max(112, Math.min(canvas.current!.clientHeight - 112, sy)),
          world: wp,
          choice: null,
        });
      }, 420);
      moveGesture.current = gesture;
    }
  };
  const pm = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    if (e.pointerType === "touch" && touchPoints.current.has(e.pointerId)) {
      touchPoints.current.set(e.pointerId, { x: sx, y: sy });
      if (pinch.current && touchPoints.current.size >= 2) {
        const [a, b] = [...touchPoints.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const nextZoom = Math.max(0.55, Math.min(1.7, pinch.current.zoom * (distance / pinch.current.distance)));
        const g = game.current;
        g.zoom = nextZoom;
        moveCameraTo(
          pinch.current.worldMid.x - (mid.x - canvas.current!.clientWidth / 2) / nextZoom,
          pinch.current.worldMid.y - (mid.y - canvas.current!.clientHeight / 2) / nextZoom,
        );
        return;
      }
    }
    if (!pointer.current) return;
    const p = pointer.current;
    const gesture = moveGesture.current;
    if (gesture?.opened) {
      const dy = sy - gesture.start.y;
      const choice = dy < -34 ? "engage" : dy > 34 ? "direct" : null;
      if (choice !== gesture.choice) {
        gesture.choice = choice;
        setMoveChooser({
          x: Math.max(112, Math.min(canvas.current!.clientWidth - 112, gesture.start.x)),
          y: Math.max(112, Math.min(canvas.current!.clientHeight - 112, gesture.start.y)),
          world: gesture.world,
          choice,
        });
      }
      p.x = sx;
      p.y = sy;
      return;
    }
    if (Math.hypot(sx - p.start.x, sy - p.start.y) > 12) {
      if (gesture?.timer) clearTimeout(gesture.timer);
      moveGesture.current = null;
      p.drag = true;
    }
    if (p.drag) {
      const dx = sx - p.x,
        dy = sy - p.y;
      if (matchMedia("(pointer: coarse)").matches) {
        game.current.camera.x -= dx / game.current.zoom;
        game.current.camera.y -= dy / game.current.zoom;
        p.wx = screenToWorld(sx, sy).x;
        p.wy = screenToWorld(sx, sy).y;
      }
      p.x = sx;
      p.y = sy;
    }
  };
  const pu = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      touchPoints.current.delete(e.pointerId);
      if (pinchConsumed.current) {
        if (touchPoints.current.size < 2) pinch.current = null;
        if (touchPoints.current.size === 0) pinchConsumed.current = false;
        pointer.current = null;
        return;
      }
    }
    const gesture = moveGesture.current;
    if (gesture?.timer) clearTimeout(gesture.timer);
    moveGesture.current = null;
    if (gesture?.opened) {
      pointer.current = null;
      if (gesture.choice) commitTravelChoice(gesture.world, gesture.choice);
      return;
    }
    const p = pointer.current;
    if (!p) return;
    const r = canvas.current!.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top,
      wp = screenToWorld(sx, sy),
      g = game.current;
    if (!p.drag) g.matchStats.playerActions++;
    // The minimap is an interactive navigation control, not part of the world.
    const mw = 132, mh = 82, mx = canvas.current!.clientWidth - mw - 12, my = 12;
    if (!p.drag && sx >= mx && sx <= mx + mw && sy >= my && sy <= my + mh) {
      const alerts = (g.attackAlerts || [])
        .filter((alert) => alert.team === "player" && alert.expiresAt > g.time)
        .sort((a, b) => b.startedAt - a.startedAt);
      const tappedAlert = alerts.find((alert) => {
        const object = [...g.units, ...g.buildings].find((candidate) => candidate.id === alert.targetId && candidate.team === "player");
        const ax = mx + (((object?.x ?? alert.x) / W) * mw);
        const ay = my + (((object?.y ?? alert.y) / H) * mh);
        return Math.hypot(sx - ax, sy - ay) <= 16;
      });
      const focus = tappedAlert
        ? [...g.units, ...g.buildings].find((candidate) => candidate.id === tappedAlert.targetId && candidate.team === "player") || tappedAlert
        : { x: ((sx - mx) / mw) * W, y: ((sy - my) / mh) * H };
      moveCameraTo(focus.x, focus.y);
      g.message = tappedAlert ? "Camera jumped to the latest attack alert." : "Viewport moved to minimap location.";
      pointer.current = null;
      sync();
      return;
    }
    if (p.drag && !matchMedia("(pointer: coarse)").matches) {
      const x1 = Math.min(p.wx, wp.x),
        x2 = Math.max(p.wx, wp.x),
        y1 = Math.min(p.wy, wp.y),
        y2 = Math.max(p.wy, wp.y);
      const boxed = g.units
        .filter(
          (u) =>
            u.team === "player" && u.x > x1 && u.x < x2 && u.y > y1 && u.y < y2,
        )
        .map((u) => u.id);
      g.selected = e.shiftKey
        ? [...new Set([...g.selected, ...boxed])]
        : boxed;
      g.message = g.selected.length
        ? `${g.selected.length} units selected.`
        : "No units in selection box.";
    } else if (!p.drag) {
      const nearestBuilding = g.buildings
        .filter((building) => building.team === "player")
        .sort(
          (a, b) =>
            Math.hypot(a.x - wp.x, a.y - wp.y) -
            Math.hypot(b.x - wp.x, b.y - wp.y),
        )[0];
      const buildingTap = nearestBuilding &&
        Math.hypot(nearestBuilding.x - wp.x, nearestBuilding.y - wp.y) <
          buildingStats[nearestBuilding.type].r + 18
          ? nearestBuilding
          : undefined;
      const hit = buildingTap || [...g.units, ...g.buildings]
        .filter((o) => o.team === "player")
        .sort(
          (a, b) =>
            Math.hypot(a.x - wp.x, a.y - wp.y) -
            Math.hypot(b.x - wp.x, b.y - wp.y),
        )[0];
      const selectedUnits = g.units.filter(
        (u) => u.team === "player" && g.selected.includes(u.id),
      );
      const hitDistance = hit
        ? Math.hypot(hit.x - wp.x, hit.y - wp.y)
        : Infinity;
      const hitWireframe = hit && g.buildings.find((building) =>
        building.id === hit.id && (building.progress ?? 1) < 1,
      );
      if (hitWireframe && hitDistance < 55) {
        g.selected = [hitWireframe.id];
        g.mode = "select";
        g.message = `${hitWireframe.type.toUpperCase()} wireframe selected · cancel it below or leave it in the Worker queue.`;
        lastTap.current = { id: hitWireframe.id, time: performance.now() };
        pointer.current = null;
        sync();
        return;
      }
      // Friendly structures take tap priority over movement. A single tap on a
      // building clears the current unit group and opens that building's
      // commands instead of silently ordering the units toward it.
      if (g.mode === "select" && buildingTap && selectedUnits.length) {
        g.selected = [buildingTap.id];
        g.message = `${buildingTap.type === "turret" ? "SENTRY TURRET" : buildingTap.type.toUpperCase()} selected.`;
        lastTap.current = { id: buildingTap.id, time: performance.now() };
        pointer.current = null;
        sync();
        return;
      }
      if (
        g.mode === "select" &&
        selectedUnits.length &&
        hit &&
        hitDistance < 55 &&
        !g.selected.includes(hit.id)
      ) {
        command(wp.x, wp.y);
        lastTap.current = null;
      } else if (hit && hitDistance < 55 && g.mode === "select") {
        const now = performance.now(),
          unit = g.units.find((u) => u.id === hit.id),
          building = g.buildings.find((b) => b.id === hit.id),
          repeat =
            lastTap.current?.id === hit.id && now - lastTap.current.time < 350;
        if (unit && repeat) {
          const halfW = canvas.current!.clientWidth / (2 * g.zoom),
            halfH = canvas.current!.clientHeight / (2 * g.zoom);
          g.selected = g.units
            .filter(
              (u) =>
                u.team === "player" &&
                u.type === unit.type &&
                u.x >= g.camera.x - halfW &&
                u.x <= g.camera.x + halfW &&
                u.y >= g.camera.y - halfH &&
                u.y <= g.camera.y + halfH,
            )
            .map((u) => u.id);
          g.message = `Selected ${g.selected.length} visible ${unitName(unit.type).toLowerCase()}${g.selected.length === 1 ? "" : "s"}.`;
          lastTap.current = null;
        } else if (
          building &&
          repeat &&
          ["hq", "barracks"].includes(building.type)
        ) {
          g.selected = [building.id];
          g.mode = "set-rally";
          g.message = `RALLY POINT: tap where new ${building.type === "hq" ? "Workers" : "combat units"} should go.`;
          lastTap.current = null;
        } else {
          if (e.shiftKey) {
            g.selected = g.selected.includes(hit.id)
              ? g.selected.filter((id) => id !== hit.id)
              : [...g.selected, hit.id];
          } else {
            g.selected = [hit.id];
          }
          g.message =
            building && ["hq", "barracks"].includes(building.type)
              ? `${building.type.toUpperCase()} selected · choose Set Waypoint in the command bar.`
              : "";
          lastTap.current = { id: hit.id, time: now };
        }
      } else {
        lastTap.current = null;
        command(wp.x, wp.y);
      }
    }
    pointer.current = null;
    sync();
  };
  const pointerCancel = (e: React.PointerEvent) => {
    if (moveGesture.current?.timer) clearTimeout(moveGesture.current.timer);
    moveGesture.current = null;
    setMoveChooser(null);
    touchPoints.current.delete(e.pointerId);
    if (touchPoints.current.size < 2) pinch.current = null;
    if (touchPoints.current.size === 0) pinchConsumed.current = false;
    pointer.current = null;
  };
  const contextCommand = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (pausedRef.current || game.current.over) return;
    if (cancelCommandMode()) return;
    const r = canvas.current!.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    const mw = 132, mh = 82, mx = canvas.current!.clientWidth - mw - 12, my = 12;
    if (sx >= mx && sx <= mx + mw && sy >= my && sy <= my + mh) return;
    game.current.matchStats.playerActions++;
    const wp = screenToWorld(sx, sy);
    command(wp.x, wp.y);
  };
  const wheel = (e: React.WheelEvent) => {
    e.preventDefault();
    game.current.zoom = Math.max(
      0.55,
      Math.min(1.7, game.current.zoom * (e.deltaY > 0 ? 0.9 : 1.1)),
    );
  };
  const activeTip = ui.selectedBuilding === "hq" && (ui.hqPacked || ui.hqRelocation)
    ? { key: "command-crawler", title: "MOBILE HEADQUARTERS", text: "The crawler moves at only 12 map units per second. Production, supply, research, and reinforcement stay offline until it finishes deploying on clear terrain." }
    : ui.selectedBuilding === "barracks" && ui.productionBuilding === "barracks"
    ? { key: "barracks-rally", title: "BARRACKS WAYPOINT", text: "Select a completed Barracks, choose Set Waypoint, then tap the battlefield. New combat units will deploy toward it." }
    : ui.selectedBuilding === "barracks"
      ? { key: "barracks-building", title: "BARRACKS CONSTRUCTION", text: "The wireframe waits for an assigned Worker to arrive. Construction time starts only when the Worker is on site." }
    : ui.selectedWorkers > 0
      ? { key: "worker-orders", title: "WORKER ORDERS", text: "Place several construction wireframes before pressing Cancel; assigned Workers visit and build them in order. A Move order still leaves the Worker on guard instead of resuming mining." }
      : ui.selectedCombat > 0
        ? { key: "combat-orders", title: "TRAVEL ORDERS", text: "Long-press open ground: slide up for Move + Engage or down for Direct Move. Both orders keep their destination; Move + Engage resumes after nearby threats." }
        : { key: "select-units", title: "FIELD TUTORIAL", text: "Select a Worker to construct, your HQ to train or research, or a completed Barracks to train combat units." };
  const showActiveTip = tutorialsEnabled && !homeOpen && !paused && !dismissedTips.includes(activeTip.key);
  const commandProgress = commandProfileProgress(commandProfile);
  const productionButton = (type: Unit["type"]) => {
    const active = ui.production?.type === type;
    const coolingDown = !ui.production && ui.productionCooldown > 0;
    const cost = unitCost[type];
    const shortfall = Math.max(0, cost - ui.credits);
    const unaffordable = shortfall > 0;
    const locked =
      type === "worker"
        ? ui.productionBuilding !== "hq" || Boolean(ui.fortifyProduction) || Boolean(ui.doctrineProduction) || coolingDown
        : ui.productionBuilding !== "barracks" || coolingDown;
    const idle =
      type === "worker"
        ? `150 CREDITS · 8s · ${unitHealth.worker} HP`
        : type === "trooper"
          ? `125 CREDITS · 6s · COUNTERS AIR`
          : type === "tank"
            ? `400 CREDITS · 15s · COUNTERS INFANTRY`
            : `300 CREDITS · 12s · COUNTERS ARMOR`;
    const lockText = coolingDown
      ? `COOLDOWN ${Math.ceil(ui.productionCooldown)}s`
      : type === "worker"
        ? "HQ BUSY"
        : "BARRACKS UNAVAILABLE";
    return (
      <button
        key={type}
        disabled={locked || unaffordable}
        className={`${active ? "producing " : ""}${locked ? "locked " : ""}${unaffordable ? "unaffordable" : ""}`}
        onClick={() => action(type)}
        title={unaffordable ? `${shortfall} more credits required` : undefined}
      >
        <kbd>{type === "worker" ? "V" : type === "trooper" ? "I" : type === "tank" ? "K" : "N"}</kbd>
        <span className={`command-art unit-${type}`} aria-hidden="true">
          {(locked || unaffordable) && <b className="command-art-badge">{unaffordable ? "−" : "🔒"}</b>}
        </span>
        <span>
          {unitName(type)}
          <small>{unaffordable ? `NEED ${shortfall} MORE CREDITS` : locked ? lockText : active ? `${Math.max(0, Math.ceil(ui.production!.duration - ui.production!.elapsed))}s` : idle}</small>
          {active && (
            <em style={{ "--progress": `${(ui.production!.elapsed / ui.production!.duration) * 100}%` } as React.CSSProperties} />
          )}
        </span>
      </button>
    );
  };
  return (
    <main className="game-shell">
      {homeOpen && (
        <section className="home-screen" aria-label="Frontier Command home screen">
          <div className="home-grid" />
          <div className="home-panel">
            <span className="home-sigil">FC</span>
            <small>TACTICAL NETWORK // ALPHA</small>
            <h1>FRONTIER<br />COMMAND</h1>
            <p>Balance credits, alloy, and intel. Control the map. Destroy the enemy command core.</p>
            <section className="command-profile" aria-label={`Command level ${commandProgress.level}`}>
              <div className="command-profile-heading">
                <span><small>COMMAND DEVELOPMENT</small><b>LEVEL {commandProgress.level}</b></span>
                <span><strong>{commandProgress.points}</strong><small>COMMAND POINT{commandProgress.points === 1 ? "" : "S"}</small></span>
              </div>
              <div className="command-xp-track" aria-label={`${commandProgress.current} of ${commandProgress.needed} Command XP toward the next level`}>
                <i style={{ width: `${commandProgress.progress * 100}%` }} />
              </div>
              <div className="command-xp-readout">
                <span>{commandProgress.current} / {commandProgress.needed} COMMAND XP</span>
                {commandProfile.lastAward > 0 && <small>LAST MATCH +{commandProfile.lastAward}</small>}
              </div>
              <div className="command-research-preview" aria-label="Upcoming command research paths">
                <span>⌁ FIRE CONTROL<small>COMING NEXT</small></span>
                <span>⬡ REINFORCED FRAMES<small>COMING NEXT</small></span>
                <span>◎ TACTICAL INTELLIGENCE<small>COMING NEXT</small></span>
              </div>
            </section>
            {hasAutosave && (
              <button className="continue-match" onClick={continueMatch}>
                <b>CONTINUE MATCH</b>
                <small>{game.current.fogEnabled ? "TACTICAL FOG" : "OPEN INTEL"} · WAVE {game.current.wave}</small>
              </button>
            )}
            <div className="mode-heading">
              <span>NEW MATCH MODE</span>
              <small>RESOURCES RANDOMIZE EACH MATCH</small>
            </div>
            <div className="mode-options" role="radiogroup" aria-label="Fog of war mode">
              <button
                role="radio"
                aria-checked={!newMatchFog}
                className={!newMatchFog ? "selected" : ""}
                onClick={() => setNewMatchFog(false)}
              >
                <i>◎</i><b>OPEN INTEL</b><small>No fog of war. Full battlefield visible.</small>
              </button>
              <button
                role="radio"
                aria-checked={newMatchFog}
                className={newMatchFog ? "selected" : ""}
                onClick={() => setNewMatchFog(true)}
              >
                <i>◐</i><b>TACTICAL FOG</b><small>Scout to reveal terrain and enemy forces.</small>
              </button>
            </div>
            <button className="launch-match" onClick={() => startNewMatch()}>
              LAUNCH SINGLE-PLAYER MATCH
            </button>
            <div className="multiplayer-divider"><span>PRIVATE ONLINE 1V1</span></div>
            {network.role !== "solo" && ["creating", "waiting", "joining", "connecting"].includes(network.status) ? (
              <div className="room-waiting">
                <small>{network.status === "waiting" ? "ROOM READY — SEND THIS CODE" : network.role === "guest" ? "JOINING PRIVATE ROOM" : "ESTABLISHING TACTICAL LINK"}</small>
                <strong>{network.code || "······"}</strong>
                <p>{network.status === "waiting" ? "The second player opens Frontier Command, enters this code, and joins." : network.role === "guest" ? "Connecting directly to the host commander…" : "Preparing the private connection…"}</p>
                <button onClick={() => { leaveMultiplayer(); setNetwork({ role: "solo", status: "idle", code: "", detail: "" }); }}>CANCEL ROOM</button>
              </div>
            ) : (
              <div className="private-match-actions">
                <button
                  className="create-room"
                  onClick={createPrivateMatch}
                  disabled={["creating", "joining", "connecting"].includes(network.status)}
                >
                  <b>CREATE PRIVATE MATCH</b>
                  <small>GET A SIX-CHARACTER ROOM CODE</small>
                </button>
                <div className="join-room">
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                    onKeyDown={(event) => { if (event.key === "Enter") void joinPrivateMatch(); }}
                    placeholder="ROOM CODE"
                    aria-label="Private multiplayer room code"
                    maxLength={6}
                  />
                  <button onClick={joinPrivateMatch} disabled={network.status === "joining"}>
                    {network.status === "joining" ? "JOINING…" : "JOIN MATCH"}
                  </button>
                </div>
              </div>
            )}
            {network.status === "error" && <p className="network-error">{network.detail}</p>}
          </div>
        </section>
      )}
      <header>
        <div className="brand">
          <span className="sigil">FC</span>
          <div>
            <b>FRONTIER COMMAND</b>
            <small>TACTICAL NETWORK // ALPHA</small>
          </div>
        </div>
        <div className="resources">
          <span>
            ◆ <b>{ui.credits}</b> CREDITS
          </span>
          <span>
            ⬢ <b>{ui.alloy}</b> ALLOY
          </span>
          <span>
            ◉ <b>{ui.intel}</b> INTEL
          </span>
          <span className="power-state">
            ϟ <b>{ui.power}</b> POWER
          </span>
          <span className={`uplink-state ${ui.objectives ? "prep" : "danger"}`}>
            UPLINKS <b>{ui.objectives}/2</b>
          </span>
          <span className="save-state">
            {network.role === "solo" ? saveStatus : network.status === "connected" ? `ROOM ${network.code}` : "LINKING"}
          </span>
          <span className={network.role === "solo" ? (ui.wave === 0 ? "prep" : "danger") : "prep"}>
            {network.role !== "solo"
              ? "PRIVATE 1V1"
              : ui.wave === 0
                ? `PREP ${ui.nextWave}s`
                : `WAVE ${ui.wave} · ${ui.nextWave}s`}
          </span>
          <button
            className="menu-button"
            onClick={() => setPause(true)}
            aria-label="Pause and open game menu"
          >
            ☰
          </button>
        </div>
      </header>
      <section className="viewport">
        <canvas
          ref={canvas}
          onPointerDown={pd}
          onPointerMove={pm}
          onPointerUp={pu}
          onPointerCancel={pointerCancel}
          onWheel={wheel}
          onContextMenu={contextCommand}
          aria-label="Frontier Command battlefield"
        />
        {moveChooser && (
          <div
            className="move-gesture"
            style={{ left: moveChooser.x, top: moveChooser.y }}
            role="menu"
            aria-label="Choose travel engagement behavior"
          >
            <button
              className={`engage ${moveChooser.choice === "engage" ? "chosen" : ""}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => commitTravelChoice(moveChooser.world, "engage")}
              role="menuitem"
            >
              <i>↑</i><b>MOVE + ENGAGE</b><small>FIGHT, THEN RESUME</small>
            </button>
            <div className="move-gesture-anchor"><span>HOLD</span><i>◆</i><small>SLIDE</small></div>
            <button
              className={`direct ${moveChooser.choice === "direct" ? "chosen" : ""}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => commitTravelChoice(moveChooser.world, "direct")}
              role="menuitem"
            >
              <i>↓</i><b>DIRECT MOVE</b><small>IGNORE THREATS</small>
            </button>
          </div>
        )}
        <div className="objective">
          <small>PRIMARY OBJECTIVE</small>
          <b>DESTROY THE ENEMY COMMAND CORE</b>
          <span>CAPTURE UPLINKS FOR INTEL · +5% DAMAGE EACH · STACKS TO +10%</span>
          <span className="economy-readout">ARMY {ui.army} · UPKEEP {Math.ceil(ui.upkeep)} CREDITS/MIN AFTER {UPKEEP_SOFT_CAP}</span>
        </div>
        {network.role !== "solo" && ["disconnected", "error"].includes(network.status) && (
          <div className="connection-lost">
            <small>TACTICAL LINK LOST</small>
            <b>OTHER COMMANDER DISCONNECTED</b>
            <p>{network.detail || "The private connection ended."}</p>
            <button onClick={openHome}>RETURN HOME</button>
          </div>
        )}
        <div className="zoom">
          <button
            onClick={() =>
              (game.current.zoom = Math.min(1.7, game.current.zoom + 0.15))
            }
          >
            ＋
          </button>
          <button
            onClick={() =>
              (game.current.zoom = Math.max(0.55, game.current.zoom - 0.15))
            }
          >
            −
          </button>
        </div>
        {paused && (
          <div className="pause-menu">
            <div className="menu-panel">
              <small>TACTICAL NETWORK</small>
              <h1>{network.role === "solo" ? "GAME PAUSED" : "TACTICAL LINK"}</h1>
              {network.role === "solo" && <div className="difficulty-readout">
                <div className="difficulty-heading">
                  <span>AI DIFFICULTY</span>
                  <b>{difficultyInfo(game.current.adaptive).label}</b>
                </div>
                <div className="difficulty-bar" aria-label={`AI difficulty level ${difficultyInfo(game.current.adaptive).level} of 5`}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <i key={index} className={index < difficultyInfo(game.current.adaptive).level ? "filled" : ""} />
                  ))}
                </div>
                <small>LEVEL {difficultyInfo(game.current.adaptive).level} / 5</small>
              </div>}
              <p>{network.role === "solo" ? saveStatus : `PRIVATE ROOM ${network.code} · MATCH CONTINUES WHILE THIS MENU IS OPEN`}</p>
              <button className="primary" onClick={() => setPause(false)}>
                {network.role === "solo" ? "RESUME" : "RETURN TO BATTLE"}
              </button>
              <div className="pc-controls">
                <b>DESKTOP CONTROLS</b>
                <span>RIGHT-CLICK MOVE / ATTACK · SHIFT ADD SELECT</span>
                <span>WASD / ARROWS PAN · WHEEL ZOOM · SPACE CENTER</span>
                <span>CTRL+1–9 SAVE GROUP · 1–9 RECALL · DOUBLE-PRESS CENTER</span>
                <span>WORKER SELECTED: R REFINERY · B BARRACKS · T TURRET</span>
                <span>HQ SELECTED: V WORKER · Q RESEARCH · G WAYPOINT · J PACK/DEPLOY · L MOVE CRAWLER</span>
                <span>BARRACKS SELECTED: I TROOPER · K TANK · N DRONE · G WAYPOINT</span>
                <span>Z MOVE · C PURSUE · H HOLD · P PATROL · Y REPAIR · O AUTO REPAIR</span>
                <span>F FORTIFY · U AIR DOCTRINE · M ARMOR DOCTRINE</span>
              </div>
              <button
                className={tutorialsEnabled ? "tips-toggle active" : "tips-toggle"}
                onClick={toggleTutorials}
                aria-pressed={tutorialsEnabled}
              >
                TUTORIAL & TOOLTIPS: {tutorialsEnabled ? "ON" : "OFF"}
              </button>
              {network.role === "solo" && <button onClick={saveManual}>SAVE GAME</button>}
              {network.role === "solo" && <button onClick={loadManual}>LOAD GAME</button>}
              <button
                className="warning"
                onClick={openHome}
              >
                HOME / NEW GAME
              </button>
            </div>
          </div>
        )}
        {ui.over && (
          <div className="end">
            <small>OPERATION COMPLETE</small>
            <h1>{ui.over === "won" ? "VICTORY" : "BASE LOST"}</h1>
            {network.role === "solo" && (() => {
              const review = readDifficulty().reviews.at(-1);
              return review ? <p className="match-review"><b>{review.summary}</b><br />Match performance: {Math.round(review.score)}/100{review.commandXp ? <><br /><strong>+{review.commandXp} COMMAND XP</strong></> : null}<br /><small>Next opponent: {difficultyInfo(adaptiveDifficulty()).label}</small></p> : null;
            })()}
            {network.role === "solo" && <button onClick={() => action("reset")}>PLAY AGAIN</button>}
            <button onClick={openHome}>HOME</button>
          </div>
        )}
        {showActiveTip && (
          <aside className="tactical-tip" aria-live="polite">
            <button className="tip-close" onClick={() => dismissTip(activeTip.key)} aria-label="Dismiss this tip">×</button>
            <small>{activeTip.title}</small>
            <p>{activeTip.text}</p>
            <button className="tip-disable" onClick={toggleTutorials}>TURN ALL TIPS OFF</button>
          </aside>
        )}
      </section>
      <section className="command">
        <div className="status">
          <small>FIELD COMMS</small>
          <p>{ui.message}</p>
        </div>
        <div className="selection">
          <span
            className={`portrait ${ui.selectedUnitType && ui.selectedUnitType !== "mixed" ? `command-art unit-${ui.selectedUnitType}` : ui.selectedBuilding ? `command-art building-${ui.selectedBuilding}` : ""}`}
            aria-hidden="true"
          >{!ui.selectedUnitType && !ui.selectedBuilding ? "◈" : ""}</span>
          <div>
            <small>SELECTION</small>
            <b>{ui.selected}</b>
          </div>
          <button
            className="deselect"
            onClick={() => action("deselect")}
            disabled={!ui.canClear}
          >
            {ui.cancelMode ? "CANCEL" : "CLEAR"}
          </button>
        </div>
        <div className="combat-legend">
          <small>COMBAT READOUT</small>
          <span><b>HP</b> health · <b>DMG</b> damage per shot</span>
          <span>Trooper → Drone → Tank → Trooper · favored matchup +55% DMG</span>
          <span>Captured uplinks grant +5% DMG each · stacks to +10%</span>
          <span>Ground units firing down from a plateau gain +10% DMG · enter by either ramp</span>
        </div>
        <div className="command-center">
          <div className="command-context" aria-label="Current command menu">
            {(commandTab === "buildings" || commandTab === "tech") ? (
              <button className="context-back" onClick={() => setCommandTab("units")}>
                <i>‹</i>
                <span>{commandTab === "buildings" ? "CONSTRUCTION" : "HQ RESEARCH"}<small>BACK TO ORDERS</small></span>
              </button>
            ) : ui.selectedUnits > 0 ? (
              <div className="selection-command-header">
                <span className={`command-tab-art ${ui.selectedUnitType && ui.selectedUnitType !== "mixed" ? `unit-${ui.selectedUnitType}` : ""}`} aria-hidden="true">{ui.selectedUnitType === "mixed" ? "◈" : ""}</span>
                <b>{ui.selectedUnits === 1 ? unitName(ui.selectedUnitType as Unit["type"]) : `${ui.selectedUnits} UNITS`}</b>
                <small>FIELD ORDERS</small>
              </div>
            ) : ui.selectedBuilding ? (
              <div className="selection-command-header">
                <span className={`command-tab-art building-${ui.selectedBuilding}`} aria-hidden="true" />
                <b>{ui.selectedBuilding === "hq" && ui.hqPacked ? "COMMAND CRAWLER" : ui.selectedBuilding === "hq" ? "HEADQUARTERS" : ui.selectedBuilding === "turret" ? "SENTRY TURRET" : ui.selectedBuilding.toUpperCase()}</b>
                <small>{ui.selectedConstruction ? "CONSTRUCTION WIREFRAME" : ui.selectedBuilding === "hq" && ui.hqRelocation ? `${ui.hqRelocation.mode === "pack" ? "PACKING" : "DEPLOYING"} · ${Math.ceil(ui.hqRelocation.duration - ui.hqRelocation.elapsed)}s` : ui.selectedBuilding === "hq" && ui.hqPacked ? "MOBILE · COMMAND SYSTEMS OFFLINE" : ui.selectedBuilding === "hq" ? "COMMAND & RESEARCH" : ui.selectedBuilding === "barracks" ? "UNIT PRODUCTION" : "STRUCTURE ORDERS"}</small>
              </div>
            ) : (
              <div className="selection-command-header no-command">
                <span className="command-tab-tech" aria-hidden="true">⌁</span>
                <b>COMMAND READY</b>
                <small>SELECT A UNIT OR BUILDING</small>
              </div>
            )}
          </div>
          <div className="actions" role="tabpanel">
            {ui.selectedWorkers > 0 && commandTab === "buildings" ? (
              <>
                <button disabled={ui.alloy < BUILD_COST.refinery} className={`${ui.buildMode === "build-refinery" ? "placing " : ""}${ui.alloy < BUILD_COST.refinery ? "unaffordable" : ""}`} aria-pressed={ui.buildMode === "build-refinery"} onClick={() => action("build-refinery")} title={ui.alloy < BUILD_COST.refinery ? `${BUILD_COST.refinery - ui.alloy} more alloy required` : undefined}>
                  <kbd>R</kbd><span className="command-art building-refinery" aria-hidden="true" /><span>REFINERY<small>{ui.alloy < BUILD_COST.refinery ? `NEED ${BUILD_COST.refinery - ui.alloy} MORE ALLOY` : `${BUILD_COST.refinery} ALLOY · TAP MULTIPLE SITES`}</small></span>
                </button>
                <button disabled={ui.alloy < BUILD_COST.barracks} className={`${ui.buildMode === "build-barracks" ? "placing " : ""}${ui.alloy < BUILD_COST.barracks ? "unaffordable" : ""}`} aria-pressed={ui.buildMode === "build-barracks"} onClick={() => action("build-barracks")} title={ui.alloy < BUILD_COST.barracks ? `${BUILD_COST.barracks - ui.alloy} more alloy required` : undefined}>
                  <kbd>B</kbd><span className="command-art building-barracks" aria-hidden="true" /><span>BARRACKS<small>{ui.alloy < BUILD_COST.barracks ? `NEED ${BUILD_COST.barracks - ui.alloy} MORE ALLOY` : `${BUILD_COST.barracks} ALLOY · TAP MULTIPLE SITES`}</small></span>
                </button>
                <button disabled={ui.alloy < BUILD_COST.turret} className={`${ui.buildMode === "build-turret" ? "placing " : ""}${ui.alloy < BUILD_COST.turret ? "unaffordable" : ""}`} aria-pressed={ui.buildMode === "build-turret"} onClick={() => action("build-turret")} title={ui.alloy < BUILD_COST.turret ? `${BUILD_COST.turret - ui.alloy} more alloy required` : undefined}>
                  <kbd>T</kbd><span className="command-art building-turret" aria-hidden="true" /><span>SENTRY TURRET<small>{ui.alloy < BUILD_COST.turret ? `NEED ${BUILD_COST.turret - ui.alloy} MORE ALLOY` : `${BUILD_COST.turret} ALLOY · QUEUE · 15s DEPLOY`}</small></span>
                </button>
              </>
            ) : ui.selectedUnits > 0 ? (
              <>
                <button onClick={() => action("move")} title={tutorialsEnabled ? "Choose a destination. This order overrides combat until the unit arrives." : undefined}>
                  <kbd>Z</kbd><i>➤</i><span>DIRECT MOVE<small>IGNORE THREATS · DESTINATION LOCKED</small></span>
                </button>
                {ui.selectedCombat > 0 && (<>
                  <button className={ui.selectedStance === "pursue" ? "active-order" : ""} aria-pressed={ui.selectedStance === "pursue"} onClick={() => action("pursue")} title={tutorialsEnabled ? "Chase visible enemies within sight range." : undefined}>
                    <kbd>C</kbd><i>⌖</i><span>PURSUE<small>CHASE VISIBLE TARGETS</small></span>
                  </button>
                  <button className={ui.selectedStance === "hold" ? "active-order" : ""} aria-pressed={ui.selectedStance === "hold"} onClick={() => action("hold")} title={tutorialsEnabled ? "Deploy into a stationary turret form with 35% greater weapon range." : undefined}>
                    <kbd>H</kbd><i>⌾</i><span>SENTRY MODE<small>DEPLOY · +35% RANGE</small></span>
                  </button>
                  <button className={ui.selectedStance === "patrol" ? "active-order" : ""} aria-pressed={ui.selectedStance === "patrol"} onClick={() => action("patrol")} title={tutorialsEnabled ? "Choose two points. Units travel between them and engage threats en route." : undefined}>
                    <kbd>P</kbd><i>⇄</i><span>PATROL<small>SET TWO ROUTE POINTS</small></span>
                  </button>
                  <button className="retreat" onClick={() => action("retreat")} title={tutorialsEnabled ? "Return to HQ 20% faster, avoid combat, and heal on arrival." : undefined}>
                    <kbd>E</kbd><i>↩</i><span>RETREAT<small>DISENGAGE · HEAL AT HQ</small></span>
                  </button>
                </>)}
                {ui.selectedWorkers > 0 && (<>
                  <button onClick={() => setCommandTab("buildings")} title={tutorialsEnabled ? "Open the Worker construction menu." : undefined}>
                    <i>▦</i><span>CONSTRUCTION<small>OPEN BUILD MENU</small></span>
                  </button>
                  <button onClick={() => action("repair")} title={tutorialsEnabled ? "Choose one damaged friendly unit or structure to repair. Repairs consume alloy." : undefined}>
                    <kbd>Y</kbd><i>🔧</i><span>REPAIR TARGET<small>UNITS + STRUCTURES · {REPAIR_RATE} HP/s</small></span>
                  </button>
                  <button className={ui.autoRepair ? "active-order repair-toggle" : "repair-toggle"} aria-pressed={ui.autoRepair} onClick={() => action("auto-repair")} title={tutorialsEnabled ? "When enabled, these Workers stop mining and automatically repair nearby friendly units and structures. Default is off." : undefined}>
                    <kbd>O</kbd><i>{ui.autoRepair ? "✓" : "○"}</i><span>AUTO REPAIR {ui.autoRepair ? "ON" : "OFF"}<small>{ui.repairingWorkers ? `${ui.repairingWorkers} REPAIRING` : "STOPS MINING · REPAIRS ALLIES"}</small></span>
                  </button>
                  {ui.autoRepair && ui.selectedCombat === 0 && (
                    <button className={ui.selectedStance === "patrol" ? "active-order" : ""} aria-pressed={ui.selectedStance === "patrol"} onClick={() => action("patrol")} title={tutorialsEnabled ? "Set two patrol points. Workers repair nearby allies, then resume the route." : undefined}>
                      <kbd>P</kbd><i>⇄</i><span>MAINTENANCE PATROL<small>REPAIR NEAR ROUTE · RESUME</small></span>
                    </button>
                  )}
                </>)}
              </>
            ) : ui.selectedConstruction && ui.selectedBuilding ? (
              <button className="sell" onClick={() => action("cancel-construction")}>
                <i>✕</i><span>CANCEL {ui.selectedBuilding === "turret" ? "SENTRY" : ui.selectedBuilding.toUpperCase()}<small>FULL REFUND BEFORE WORK · 50% AFTER START</small></span>
              </button>
            ) : ui.selectedBuilding === "hq" && !ui.hqPacked && !ui.hqRelocation && commandTab === "tech" ? (
              <>
                <button disabled={ui.fortified || Boolean(ui.fortifyProduction) || Boolean(ui.doctrineProduction) || ui.intel < FORTIFY_INTEL_COST} className={ui.fortified ? "locked" : ui.fortifyProduction ? "placing" : ui.intel < FORTIFY_INTEL_COST ? "unaffordable" : ""} onClick={() => action("fortify")} title={ui.intel < FORTIFY_INTEL_COST ? `${FORTIFY_INTEL_COST - ui.intel} more intel required` : undefined}>
                  <kbd>F</kbd><span className="command-art building-hq" aria-hidden="true">{ui.fortified && <b className="command-art-badge">✓</b>}</span>
                  <span>{ui.fortified ? "BASE FORTIFIED" : ui.fortifyProduction ? "FORTIFYING BASE" : "FORTIFY BASE"}<small>{ui.fortified ? "+25% STRUCTURE HP ACTIVE" : ui.fortifyProduction ? `${Math.max(0, Math.ceil(ui.fortifyProduction.duration - ui.fortifyProduction.elapsed))}s REMAINING` : ui.intel < FORTIFY_INTEL_COST ? `NEED ${FORTIFY_INTEL_COST - ui.intel} MORE INTEL` : `${FORTIFY_INTEL_COST} INTEL · 40s · +25% STRUCTURE HP`}</small></span>
                </button>
                {(["air", "armor"] as Doctrine[]).map((doctrine) => {
                  const chosen = ui.doctrine === doctrine;
                  const researching = ui.doctrineProduction?.type === doctrine;
                  const locked = Boolean(ui.doctrine && !chosen) || Boolean(ui.doctrineProduction && !researching);
                  return (
                    <button key={doctrine} disabled={Boolean(ui.doctrine) || Boolean(ui.doctrineProduction) || Boolean(ui.fortifyProduction) || ui.intel < DOCTRINE_INTEL_COST} className={chosen || locked ? "locked" : researching ? "placing" : ui.intel < DOCTRINE_INTEL_COST ? "unaffordable" : ""} onClick={() => action(`doctrine-${doctrine}`)} title={ui.intel < DOCTRINE_INTEL_COST ? `${DOCTRINE_INTEL_COST - ui.intel} more intel required` : undefined}>
                      <kbd>{doctrine === "air" ? "U" : "M"}</kbd><i>{doctrine === "air" ? "✦" : "⬢"}</i>
                      <span>{doctrine === "air" ? "AIR SUPERIORITY" : "ARMORED COMMAND"}<small>{chosen ? doctrine === "air" ? "LOCKED · +18% DRONE DMG · +15% SPEED" : "LOCKED · +18% TANK HP & DMG" : locked ? "LOCKED BY OTHER DOCTRINE" : researching ? `${Math.max(0, Math.ceil(ui.doctrineProduction!.duration - ui.doctrineProduction!.elapsed))}s REMAINING` : ui.intel < DOCTRINE_INTEL_COST ? `NEED ${DOCTRINE_INTEL_COST - ui.intel} MORE INTEL` : `${DOCTRINE_INTEL_COST} INTEL · ${DOCTRINE_DURATION}s · PERMANENT CHOICE`}</small></span>
                    </button>
                  );
                })}
                <div className="tech-report">
                  <strong>ENEMY TECH · LAST SCOUTED</strong>
                  <small>{ui.enemyDoctrineKnown
                    ? ui.enemyDoctrine === "air" ? "AIR SUPERIORITY DETECTED"
                      : ui.enemyDoctrine === "armor" ? "ARMORED COMMAND DETECTED"
                        : "NO COMPLETED DOCTRINE DETECTED"
                    : "UNKNOWN · SCOUT THE ENEMY HQ"}</small>
                </div>
              </>
            ) : ui.selectedBuilding === "hq" ? (
              ui.hqPacked ? <>
                <button disabled={Boolean(ui.hqRelocation)} onClick={() => action("move-hq")}><kbd>L</kbd><i>➤</i><span>MOVE CRAWLER<small>12 SPEED · EXTREMELY SLOW</small></span></button>
                <button disabled={Boolean(ui.hqRelocation)} className={ui.hqRelocation?.mode === "deploy" ? "placing" : ""} onClick={() => action("deploy-hq")}><kbd>J</kbd><i>⌂</i><span>{ui.hqRelocation?.mode === "deploy" ? "DEPLOYING HQ" : "DEPLOY HQ"}<small>{ui.hqRelocation ? `${Math.ceil(ui.hqRelocation.duration - ui.hqRelocation.elapsed)}s REMAINING` : "6s · REQUIRES CLEAR TERRAIN"}</small></span></button>
              </> : <>
                {productionButton("worker")}
                <button disabled={Boolean(ui.hqRelocation)} onClick={() => action("rally")}><kbd>G</kbd><i>⌖</i><span>SET WAYPOINT<small>WORKER DEPLOYMENT POINT</small></span></button>
                <button disabled={Boolean(ui.hqRelocation)} onClick={() => setCommandTab("tech")}><kbd>Q</kbd><i>⌬</i><span>RESEARCH<small>SPEND INTEL ON UPGRADES</small></span></button>
                <button disabled={Boolean(ui.hqRelocation)} className={ui.hqRelocation?.mode === "pack" ? "placing" : ""} onClick={() => action("pack-hq")}><kbd>J</kbd><i>▣</i><span>{ui.hqRelocation?.mode === "pack" ? "PACKING HQ" : "PACK HQ"}<small>{ui.hqRelocation ? `${Math.ceil(ui.hqRelocation.duration - ui.hqRelocation.elapsed)}s REMAINING` : "5s · BECOMES COMMAND CRAWLER"}</small></span></button>
              </>
            ) : ui.selectedBuilding === "barracks" ? (
              ui.productionBuilding === "barracks" ? <>
                {productionButton("trooper")}{productionButton("tank")}{productionButton("drone")}
                <button onClick={() => action("rally")}><kbd>G</kbd><i>⌖</i><span>SET WAYPOINT<small>COMBAT UNIT DEPLOYMENT</small></span></button>
                <button className="sell" onClick={() => action("sell")}><i>✕</i><span>SELL BARRACKS<small>50% REFUND</small></span></button>
              </> : <div className="production-empty"><strong>BARRACKS UNDER CONSTRUCTION</strong><small>Combat units appear here when construction is complete.</small></div>
            ) : ui.selectedBuilding ? (
              <button className="sell" onClick={() => action("sell")}><i>✕</i><span>SELL {ui.selectedBuilding === "turret" ? "SENTRY" : ui.selectedBuilding.toUpperCase()}<small>50% REFUND</small></span></button>
            ) : (
              <div className="production-empty">
                <strong>SELECT A COMMAND SOURCE</strong>
                <small>Worker: construction and repair · HQ: Workers and research · completed Barracks: combat units.</small>
              </div>
            )}
          </div>
        </div>
      </section>
      <footer>
        TOUCH: TAP SELECT · DOUBLE-TAP SELECT TYPE · LONG-PRESS GROUND + SLIDE ↑ ENGAGE / ↓ DIRECT · TAP ENEMY ATTACK · DRAG PAN{" "}
        <span>DESKTOP: LEFT DRAG SELECT · RIGHT-CLICK COMMAND · SHIFT ADD · CTRL+1–9 GROUPS · ESC PAUSE</span>
      </footer>
    </main>
  );
}
