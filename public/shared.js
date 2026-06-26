// Shared constants between server and clients (ES module + Node import).

// ---- The lane (replaces the old circular arena) ----
// z runs along the lane: players spawn at the FAR positive end, the castle/King
// sits at the negative end. Attackers charge toward -z; troops march toward +z.
export const LANE = {
  halfWidth: 26,     // playable x is [-halfWidth, +halfWidth]
  minZ: -54,         // furthest a player can advance (castle wall area)
  maxZ: 124,         // behind the player spawn line: roomy back camp to mingle
  kingZ: -98,        // King stands here, deep in a roomy rear courtyard behind his wall
  wallZ: -46,        // players blocked from z < wallZ until the gates open
  troopSpawnZ: -44,  // troops spawn here and march toward the players (+z)
  playerSpawnZ: 80,  // attacker spawn line
};
// Back-compat alias used by a few helpers
export const ARENA = { castleX: 0, castleZ: LANE.kingZ };

export const TICK_HZ = 22;
export const TICK_MS = 1000 / TICK_HZ;

export const PLAYER = {
  speed: 12,
  radius: 0.9,
  maxHp: 100,
  respawnMs: 4000,
};

// ---- King (Jeremy) ----
// EPIC fight: huge HP, and a damage shield from his living guards.
export const KING = {
  baseHp: 6000,
  hpPerPlayer: 1200,     // 40 players => ~325k HP (a ~10 min battle with the shield)
  radius: 7,
  // Shield: each living guard reduces incoming King damage; clear the lane to expose him.
  shieldPerGuard: 0.06,  // 6% reduction per guard...
  shieldMax: 0.85,       // ...up to 85% damage reduction
  moveSpeed: 15,         // King strolls at this speed (units/sec)
  // The courtyard the King may roam (he cannot enter the lane):
  area: { minX: -26, maxX: 26, minZ: LANE.kingZ - 22, maxZ: LANE.kingZ + 22 }, // stays on the hilltop mesa
  attacks: {
    slam:   { cd: 2500, dmg: 55,  radius: 16, desc: 'Ground Slam (around the King)' },
    cannon: { cd: 1700, dmg: 45,  radius: 9,  desc: 'Catapult shot (aimed)' },
    sweep:  { cd: 4500, dmg: 80,  radius: 24, desc: 'Royal Sweep (huge AoE)' },
    summon: { cd: 6000, dmg: 0,   radius: 0,  desc: 'Summon a Wave of guards' },
  },
};

// ---- Troops (the King's guards) ----
export const TROOP = {
  hp: 70,
  speed: 6.5,
  dmg: 11,            // per hit to a player
  attackCd: 900,      // ms between a troop's hits
  attackRange: 2.6,
  radius: 0.8,
  reward: 0,          // (kept for future scoring)
};
export const WAVE = {
  intervalMs: 7000,                 // auto-wave cadence
  perPlayer: 0.55,                  // troops per attacker per wave
  minPerWave: 4,
  maxPerWave: 16,
  maxAliveBase: 10,                 // cap on simultaneous troops...
  maxAlivePerPlayer: 1.3,           // ...plus this per attacker
  maxAliveHardCap: 70,
};

// ---- Forest economy + battering ram (coordination layer) ----
// Lumberjacks chop trees in the back for wood; enough wood deploys a ram the
// crowd pushes to the gate, which SHATTERS the King's shield for a burst window.
// Side rooms hang off the lane beside the BACK CAMP: within this z-window the walkable area bulges out past the walls.
export const POCKET = { zMin: 78, zMax: 116, outerX: 48 };
export const FOREST = { xMin: -46, xMax: -32, zMin: 82, zMax: 112, count: 14, regrowMs: 14000 }; // LEFT of camp -> WOOD
export const TREE = { hp: 60, radius: 1.2 };
export const CHOP = { radius: 3.6, dmg: 20, woodPerTree: 1 };   // FIRE near a tree chops it
export const IRON = { xMin: 32, xMax: 46, zMin: 82, zMax: 112, count: 12, hp: 80, radius: 3.6, ironPer: 1, regrowMs: 15000 }; // RIGHT of camp -> IRON
export const MINE_DMG = 20;
export const RAM = {
  woodNeededBase: 8, woodNeededPerPlayer: 0.5, woodNeededMax: 36,
  ironNeededBase: 6, ironNeededPerPlayer: 0.45, ironNeededMax: 30,
  startZ: 80, gateZ: -44, pushRadius: 8, perPusherSpeed: 2.2, maxSpeed: 18, idleDrift: 3,
  knockback: 10, impactDmgFrac: 0.04,
};
// How much wood/iron a single player can carry before they must haul it to a build site and dump it.
export const PACK = { cap: 8 };

// ---- Buildable structures: fixed pads you haul resources to and DUMP into to build (like the ram). ----
// Each is destructible by the King; destroyed => resets to an empty pad to rebuild.
// Built IN THE CAMP as permanent base upgrades: persist across rounds, not destructible (safe behind the lines).
// (The cannon, added separately, is the destructible front-line structure.)
// Hospital + troop camp sit on the OUTER camp-tent spots; the trebuchet is an OFFENSIVE long-range siege weapon
// placed safely behind the fence that auto-lobs low-damage shells at the gate.
export const BUILDS = [
  { id: 'hospital',  kind: 'hospital',  x: -20, z: 113, needW: 10, needI: 0, hp: 380, r: 5, destructible: false, healR: 16, healPerSec: 16 },
  { id: 'troopcamp', kind: 'troopcamp', x:  20, z: 113, needW: 8,  needI: 6, hp: 420, r: 5, destructible: false, spawnMs: 6000, capAlive: 8 },
  { id: 'trebuchet', kind: 'trebuchet', x: -22, z: 88,  needW: 10, needI: 8, hp: 460, r: 5, destructible: false, fireMs: 3000, dmg: 24, splash: 5 },
];
// Friendly troops sent by a built troop camp: march to the gate, chip it weakly, and soak the King's guards.
export const FRIENDLY = { hp: 55, speed: 6, gateDmg: 4, atkCd: 1000, atkRange: 2.6, radius: 0.8 };

// ---- The CANNON: a destructible front-line emplacement on a raised side platform. ----
// Built by dumping IRON. Crewed via 3 stations (all the single action button, by where you stand):
//   traverse cog (left) and elevation cog (right) SWEEP the aim while held (bounce); breech (back) consumes 1 iron and fires.
// DEFENSIVE anti-unit emplacement: sits safely behind the fence (out of Jeremy's reach); its shells kill TROOPS only.
export const CANNON = {
  x: 22, z: 88, platformY: 2.6, platformR: 6, r: 5, needI: 14, hp: 600,   // back-right platform; built by dumping IRON
  cogDX: 3.2, breechDZ: 3.6, stationR: 2.4,     // traverse cog at x-cogDX, elevation at x+cogDX, breech at z+breechDZ
  traverseMax: 0.7,                             // aim can swing +/- this many radians off straight-ahead
  rangeMin: 22, rangeMax: 130,                  // elevation maps to how far down-lane the shell lands
  traverseSpeed: 0.9, rangeSpeed: 70,           // sweep rates while a cog is being cranked
  shellDmg: 80, shellSplash: 9, reload: 850,    // each breech shot (consumes 1 iron from the gunner's pack)
};

// ---- Wizard (Marin) ----
export const WIZARD = {
  maxMana: 100,
  manaRegen: 12,
  moveSpeed: 15,   // the Wizard walks the hilltop with the King
  area: { minX: -26, maxX: 30, minZ: LANE.kingZ - 22, maxZ: LANE.kingZ + 22 }, // hilltop mesa
  spells: {
    heal:   { mana: 30, cd: 3000, amount: 6000, desc: 'Heal the King' },
    meteor: { mana: 35, cd: 2500, dmg: 70, radius: 10, desc: 'Meteor (hits attackers)' },
    freeze: { mana: 25, cd: 5000, dur: 3000, radius: 14, desc: 'Frost Nova (slow attackers)' },
    rally:  { mana: 30, cd: 6000, desc: 'Rally (summon a guard squad)' },
  },
};

// ---- The 5 attacker weapons ----
export const WEAPONS = {
  blaster: { name: 'Shortbow',       dmg: 14, cd: 200,  speed: 65, pellets: 1, splash: 0,  arc: false, color: 0xd8c290, desc: 'Rapid arrows' },
  shotgun: { name: 'Throwing Axes',  dmg: 9,  cd: 750,  speed: 55, pellets: 6, splash: 0,  arc: false, color: 0xc2c6ce, desc: 'Spread of axes' },
  grenade: { name: 'Firebomb',       dmg: 50, cd: 1100, speed: 32, pellets: 1, splash: 7,  arc: true,  color: 0xff7a2a, desc: 'Lobbed fire pot, big splash' },
  cannon:  { name: 'Heavy Crossbow', dmg: 38, cd: 650,  speed: 50, pellets: 1, splash: 4,  arc: false, color: 0x9aa6b4, desc: 'Piercing bolt' },
  rocket:  { name: 'Catapult',       dmg: 85, cd: 1700, speed: 42, pellets: 1, splash: 10, arc: false, color: 0x8a7866, desc: 'Hurled boulder, massive splash' },
};
export const WEAPON_ORDER = ['blaster', 'shotgun', 'grenade', 'cannon', 'rocket'];

// Players' fortified back camp (behind the spawn line). The Armory lets you buy weapons mid-round.
export const CAMP = { z0: 80, z1: 118, armory: { x: 16, z: 92, r: 7 }, armorer: { x: -16, z: 92, r: 7 } };
// Jeremy stands atop a hill behind the gate; the Wizard fires from a tower beside the castle.
export const HILL = { z: LANE.kingZ, radius: 40, height: 12 };
export const WIZ_TOWER = { x: LANE.halfWidth + 18, z: LANE.kingZ + 6, height: 46 };

export const PLAYER_COLORS = [
  0xff5555, 0x55ff55, 0x5599ff, 0xffdd33, 0xff66dd,
  0x33ffdd, 0xff8833, 0xaa66ff, 0x99ff33, 0x33aaff,
];

// ---- Defend-Your-Castle: gate, rounds, economy, shop, towers ----
export const GATE = { baseHp: 3500, hpPerPlayer: 500 };   // attackers smash this BEFORE they can hurt Jeremy
export const ROUNDS = { count: 5, combatMs: 120000, intermissionMs: 60000 };
export const GOLD = { start: 150, perKill: 10, perRoundBase: 120, perRoundPerPlayer: 6, perTroopKill: 6 };
// Attackers buy ONE weapon (permanent) with personal gold earned from kills:
export const WEAPON_BUY = { shotgun: 120, cannon: 150, grenade: 180, rocket: 300 };
export const WEAPON_BUY_ORDER = ['shotgun', 'cannon', 'grenade', 'rocket'];
export const TOWER = { range: 58, dmg: 16, cd: 850, maxCount: 6,
  slots: [[-22,-44],[22,-44],[-12,-46],[12,-46],[0,-44],[-22,-50]] }; // wall positions
export const SHOP = {
  repair:    { cost: 80,  desc: 'Repair Gate (+40% HP)' },
  reinforce: { cost: 160, desc: 'Reinforce (+25% max HP)' },
  heal:      { cost: 120, desc: 'Heal the King' },
  tower:     { cost: 200, desc: 'Build Archer Tower' },
  guards:    { cost: 130, desc: 'Bigger guard waves (+2)' },
  might:     { cost: 140, desc: 'King +20% attack damage' },
  swift:     { cost: 150, desc: 'King attacks recharge faster' },
  reach:     { cost: 130, desc: 'King +20% attack radius' },
};
export const SHOP_ORDER = ['repair', 'reinforce', 'heal', 'tower', 'guards', 'might', 'swift', 'reach'];
export const KING_UP_MAX = 5;

// ---- Attacker progression (the camp Armor & Upgrades shop) ----
// Bought with personal gold at the camp's left stall; walk up during combat OR intermission.
// Each upgrade stacks up to PERK_MAX; cost scales with how many you already own.
export const PERKS = {
  tough:   { name: 'Armor',         desc: '+30 max HP' },
  dmg:     { name: 'Sharpshooter',  desc: '+15% damage' },
  respawn: { name: 'Quick Respawn', desc: '-1s respawn' },
  swift:   { name: 'Swift Boots',   desc: '+12% move speed' },
};
export const PERK_ORDER = ['tough', 'dmg', 'respawn', 'swift'];
export const PERK_FX = { hp: 30, dmg: 0.15, respawnMs: 1000, speed: 0.12 };
export const PERK_BUY = { tough: 50, dmg: 70, respawn: 60, swift: 60 }; // base cost; total = base * (owned + 1)
export const PERK_MAX = 5;

// ---- Class active abilities (one per class/weapon, on a button with a cooldown) ----
export const ABILITIES = {
  blaster: { name: 'Dash',          cd: 5000,  kind: 'dash',    dur: 360, speedMult: 2.7 },                 // burst of speed (client-side)
  shotgun: { name: 'Whirlwind',     cd: 8000,  kind: 'whirl',   radius: 7,  dmg: 75 },                      // spin: clears the troops around you
  grenade: { name: 'Napalm',        cd: 10000, kind: 'napalm',  range: 12, radius: 8,  dmg: 80 },           // fire blast at your aim (troops + gate)
  cannon:  { name: 'Piercing Bolt', cd: 7000,  kind: 'pierce',  range: 42, width: 2.4, dmg: 85 },           // line shot skewering everything ahead
  rocket:  { name: 'Bombard',       cd: 9000,  kind: 'bombard', range: 30, splash: 11, dmg: 130 },          // lob one huge boulder
};

export function clampToLane(x, z) {
  if (z < LANE.minZ) z = LANE.minZ; else if (z > LANE.maxZ) z = LANE.maxZ = LANE.maxZ;
  const lim = (z >= POCKET.zMin && z <= POCKET.zMax) ? POCKET.outerX : LANE.halfWidth; // bulge into the side rooms
  if (x < -lim) x = -lim; else if (x > lim) x = lim;
  return [x, z];
}
