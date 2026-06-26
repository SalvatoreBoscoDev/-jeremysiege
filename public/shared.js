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
// Side rooms hang off the lane: within this z-window the walkable area bulges out past the walls.
export const POCKET = { zMin: 40, zMax: 82, outerX: 48 };
export const FOREST = { xMin: -45, xMax: -31, zMin: 46, zMax: 78, count: 14, regrowMs: 14000 }; // LEFT side room -> WOOD
export const TREE = { hp: 60, radius: 1.2 };
export const CHOP = { radius: 3.6, dmg: 20, woodPerTree: 1 };   // FIRE near a tree chops it
export const IRON = { xMin: 31, xMax: 45, zMin: 46, zMax: 78, count: 12, hp: 80, radius: 3.6, ironPer: 1, regrowMs: 15000 }; // RIGHT side room -> IRON
export const MINE_DMG = 20;
export const RAM = {
  woodNeededBase: 8, woodNeededPerPlayer: 0.5, woodNeededMax: 36,
  ironNeededBase: 6, ironNeededPerPlayer: 0.45, ironNeededMax: 30,
  startZ: 80, gateZ: -44, pushRadius: 8, perPusherSpeed: 2.2, maxSpeed: 18, idleDrift: 3,
  knockback: 10, impactDmgFrac: 0.04,
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

// ---- Attacker progression (personal perks, mining, team perks) ----
// Personal perks: free one-tap pick each intermission, stack over rounds.
export const PERKS = {
  tough:   { name: 'Tougher',       desc: '+30 max HP' },
  dmg:     { name: 'Sharpshooter',  desc: '+15% damage' },
  respawn: { name: 'Quick Respawn', desc: '-1s respawn' },
  swift:   { name: 'Swift',         desc: '+12% move speed' },
};
export const PERK_ORDER = ['tough', 'dmg', 'respawn', 'swift'];
export const PERK_FX = { hp: 30, dmg: 0.15, respawnMs: 1000, speed: 0.12 };

export function clampToLane(x, z) {
  if (z < LANE.minZ) z = LANE.minZ; else if (z > LANE.maxZ) z = LANE.maxZ = LANE.maxZ;
  const lim = (z >= POCKET.zMin && z <= POCKET.zMax) ? POCKET.outerX : LANE.halfWidth; // bulge into the side rooms
  if (x < -lim) x = -lim; else if (x > lim) x = lim;
  return [x, z];
}
