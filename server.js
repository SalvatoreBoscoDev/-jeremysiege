// Hunt for Jeremy - authoritative game server.
// Defend-Your-Castle: rounds + intermission. Castle GATE blocks the King.
// Attackers gather WOOD (left forest) + IRON (right quarry) for the battering ram,
// and earn personal GOLD from kills to buy a permanent weapon in the intermission.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { WebSocketServer } from 'ws';
import {
  LANE, POCKET, CAMP, TICK_MS, PLAYER, KING, TROOP, WAVE, WIZARD, FOREST, TREE, CHOP, IRON, MINE_DMG, RAM,
  WEAPONS, WEAPON_ORDER, PLAYER_COLORS, GATE, ROUNDS, GOLD, TOWER, SHOP, KING_UP_MAX, WEAPON_BUY, WEAPON_BUY_ORDER,
  PERKS, PERK_FX, PERK_ORDER, clampToLane,
} from './public/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;
const ENVN = (k) => process.env[k] ? parseInt(process.env[k]) : null;
const TEST_HP = ENVN('JEREMY_HP'), TEST_GATE = ENVN('GATE_HP');
const TEST_WOOD = ENVN('WOOD_NEEDED'), TEST_IRON = ENVN('IRON_NEEDED'), TEST_PGOLD = ENVN('PLAYER_GOLD');
const TEST_ROUND_MS = ENVN('ROUND_MS'), TEST_INT_MS = ENVN('INT_MS'), TEST_ROUNDS = ENVN('ROUNDS_N'), TEST_GOLD = ENVN('GOLD_START');
const NO_TROOPS = !!process.env.NO_TROOPS;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ROUTES = { '/': 'join.html', '/play': 'play.html', '/king': 'king.html', '/wizard': 'wizard.html', '/screen': 'screen.html' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = ROUTES[urlPath] || urlPath.replace(/^\//, '');
  const filePath = path.join(PUBLIC, file);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const now = () => Date.now();

// ---------- state ----------
let nextId = 1;
const clients = new Map();
const players = new Map();
let projId = 1, projectiles = [];
let troopId = 1; const troops = new Map();
const fxQueue = [];
let lastWaveAt = 0;
const trees = new Map(); let treeId = 1;       // WOOD (left)
const irons = new Map(); let ironId = 1;        // IRON (right)
let wood = 0, iron = 0;
let ram = { active: false, x: 0, z: RAM.startZ };

let phase = 'lobby';
let round = 0;
let phaseEndsAt = 0;
let gold = TEST_GOLD != null ? TEST_GOLD : GOLD.start;   // King's castle treasury
let waveBonus = 0;
let result = null;
const towers = [];
const roundsTotal = TEST_ROUNDS != null ? TEST_ROUNDS : ROUNDS.count;
const combatMs = TEST_ROUND_MS != null ? TEST_ROUND_MS : ROUNDS.combatMs;
const interMs = TEST_INT_MS != null ? TEST_INT_MS : ROUNDS.intermissionMs;

const gate = { hp: 0, maxHp: 0 };
const king = { x: 0, z: LANE.kingZ, a: 0, mx: 0, mz: 0, hp: 0, maxHp: 0, alive: true, cd: { slam: 0, cannon: 0, sweep: 0, summon: 0 }, up: { might: 0, swift: 0, reach: 0 } };
let wizard = null;

const attackerCount = () => players.size;
const gateUp = () => gate.hp > 0;

function recomputeDefenses() {
  if (phase !== 'lobby') return;
  king.maxHp = TEST_HP != null ? TEST_HP : (KING.baseHp + KING.hpPerPlayer * Math.max(1, attackerCount()));
  king.hp = king.maxHp;
  gate.maxHp = TEST_GATE != null ? TEST_GATE : (GATE.baseHp + GATE.hpPerPlayer * Math.max(1, attackerCount()));
  gate.hp = gate.maxHp;
}
function guardCount() { let n = 0; for (const t of troops.values()) if (t.hp > 0) n++; return n; }
function woodNeeded() { return TEST_WOOD != null ? TEST_WOOD : clamp(Math.round(RAM.woodNeededBase + RAM.woodNeededPerPlayer * attackerCount()), RAM.woodNeededBase, RAM.woodNeededMax); }
function ironNeeded() { return TEST_IRON != null ? TEST_IRON : clamp(Math.round(RAM.ironNeededBase + RAM.ironNeededPerPlayer * attackerCount()), RAM.ironNeededBase, RAM.ironNeededMax); }
function effMaxHp(p) { return PLAYER.maxHp + p.perks.tough * PERK_FX.hp; }
function dmgMult(p) { return 1 + p.perks.dmg * PERK_FX.dmg; }
function speedMult(p) { return 1 + p.perks.swift * PERK_FX.speed; }
function respawnDelay(p) { return Math.max(1200, PLAYER.respawnMs - p.perks.respawn * PERK_FX.respawnMs); }

function initForest() { trees.clear(); for (let i = 0; i < FOREST.count; i++) { trees.set(treeId, { id: treeId, x: FOREST.xMin + Math.random() * (FOREST.xMax - FOREST.xMin), z: FOREST.zMin + Math.random() * (FOREST.zMax - FOREST.zMin), hp: TREE.hp, alive: true, regrowAt: 0 }); treeId++; } }
function initIron() { irons.clear(); for (let i = 0; i < IRON.count; i++) { irons.set(ironId, { id: ironId, x: IRON.xMin + Math.random() * (IRON.xMax - IRON.xMin), z: IRON.zMin + Math.random() * (IRON.zMax - IRON.zMin), hp: IRON.hp, alive: true, regrowAt: 0 }); ironId++; } }
initForest(); initIron(); recomputeDefenses();
function nearestNode(map, x, z, rad) { let best = null, bd = Infinity; for (const n of map.values()) { if (!n.alive) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best && bd <= rad * rad ? best : null; }

function playerSpawn() { return [(Math.random() - 0.5) * LANE.halfWidth * 1.7, LANE.playerSpawnZ - Math.random() * 8]; }
function addPlayer(id) { const [x, z] = playerSpawn(); players.set(id, { id, x, z, a: Math.PI, mx: 0, mz: 0, hp: PLAYER.maxHp, alive: true, wep: 'blaster', lastShot: 0, respawnAt: 0, slowUntil: 0, kills: 0, deaths: 0, dmgDealt: 0, gold: TEST_PGOLD != null ? TEST_PGOLD : 0, perks: { tough: 0, dmg: 0, respawn: 0, swift: 0 }, perkRound: -1 }); recomputeDefenses(); }

// ---------- networking ----------
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => { const id = nextId++; ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } handleMessage(id, ws, m); }); ws.on('close', () => removeClient(id)); });
function removeClient(id) { const c = clients.get(id); clients.delete(id); players.delete(id); if (c && c.role === 'wizard') wizard = null; recomputeDefenses(); broadcastRoster(); }
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function broadcast(o) { const s = JSON.stringify(o); for (const c of clients.values()) if (c.ws.readyState === 1) c.ws.send(s); }
const isDefender = (id) => ['king', 'wizard'].includes(clients.get(id)?.role);

function handleMessage(id, ws, m) {
  switch (m.t) {
    case 'join': {
      const role = ['player', 'king', 'wizard', 'screen'].includes(m.role) ? m.role : 'player';
      const name = (m.name || 'Hero').toString().slice(0, 16).replace(/[<>]/g, '');
      clients.set(id, { ws, role, name, color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length] });
      if (role === 'player') addPlayer(id);
      if (role === 'wizard') wizard = { mana: WIZARD.maxMana, cd: { heal: 0, meteor: 0, freeze: 0, rally: 0 }, x: -14, z: LANE.kingZ, a: 0, mx: 0, mz: 0 };
      send(ws, { t: 'welcome', id, role, lane: LANE, weapons: WEAPONS, weaponOrder: WEAPON_ORDER, king: { radius: KING.radius, attacks: KING.attacks }, wizard: { maxMana: WIZARD.maxMana, spells: WIZARD.spells }, shop: SHOP, roundsTotal, perks: PERKS, perkOrder: PERK_ORDER, weaponBuy: WEAPON_BUY, weaponBuyOrder: WEAPON_BUY_ORDER, camp: CAMP });
      broadcastRoster();
      break;
    }
    case 'in': { const p = players.get(id); if (!p) return; p.mx = clamp(+m.mx || 0, -1, 1); p.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') p.a = m.a; break; }
    case 'fire': playerFire(id); break;
    case 'kmove': { if (clients.get(id)?.role !== 'king') return; king.mx = clamp(+m.mx || 0, -1, 1); king.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') king.a = m.a; break; }
    case 'wmove': { if (clients.get(id)?.role !== 'wizard' || !wizard) return; wizard.mx = clamp(+m.mx || 0, -1, 1); wizard.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') wizard.a = m.a; break; }
    case 'katk': kingAttack(id, m.kind, +m.x, +m.z); break;
    case 'spell': wizardSpell(id, m.kind, +m.x, +m.z); break;
    case 'perk': { const p = players.get(id); if (p && phase === 'intermission' && PERKS[m.perk] && p.perkRound !== round) { p.perks[m.perk] = (p.perks[m.perk] || 0) + 1; p.perkRound = round; p.hp = effMaxHp(p); send(ws, { t: 'ev', kind: 'perkok', perk: m.perk }); } break; }
    case 'buyweapon': { const p = players.get(id); if (!p || !WEAPON_BUY[m.w]) break; const nearArmory = Math.hypot(p.x - CAMP.armory.x, p.z - CAMP.armory.z) <= CAMP.armory.r; if ((phase === 'intermission' || (phase === 'combat' && nearArmory))) { const cost = WEAPON_BUY[m.w]; if (p.gold >= cost && p.wep !== m.w) { p.gold -= cost; p.wep = m.w; send(ws, { t: 'ev', kind: 'boughtweapon', w: m.w }); } } break; }
    case 'start': if (isDefender(id) && phase === 'lobby') startRound(1); break;
    case 'nextround': if (isDefender(id) && phase === 'intermission') startRound(round + 1); break;
    case 'buy': if (isDefender(id)) buy(m.item); break;
    case 'reset': if (isDefender(id)) resetGame(); break;
  }
}
function broadcastRoster() {
  const roster = [];
  for (const [cid, c] of clients) if (c.role === 'player') roster.push([cid, c.name, c.color]);
  const kingC = [...clients.values()].find(c => c.role === 'king');
  const wizC = [...clients.values()].find(c => c.role === 'wizard');
  broadcast({ t: 'roster', players: roster, kingName: kingC?.name || null, wizardName: wizC?.name || null, count: roster.length });
}

// ---------- rounds ----------
function startRound(n) {
  round = n; phase = 'combat'; phaseEndsAt = now() + combatMs; lastWaveAt = now();
  for (const p of players.values()) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = effMaxHp(p); p.alive = true; }
  troops.clear(); spawnWave(waveSize());
  broadcast({ t: 'ev', kind: 'round', round: n, total: roundsTotal });
}
function endRoundToIntermission() {
  gold += GOLD.perRoundBase + GOLD.perRoundPerPlayer * attackerCount();
  troops.clear(); projectiles = [];
  if (round >= roundsTotal) { endGame('king'); return; }
  phase = 'intermission'; phaseEndsAt = now() + interMs;
  broadcast({ t: 'ev', kind: 'intermission', round, gold });
}
function endGame(who) { phase = 'over'; result = who; broadcast({ t: 'ev', kind: 'gameover', result: who }); }
function buy(item) {
  if (phase !== 'intermission') return;
  const cfg = SHOP[item]; if (!cfg || gold < cfg.cost) return;
  if (item === 'tower') { if (towers.length >= TOWER.maxCount) return; const slot = TOWER.slots[towers.length] || [0, LANE.wallZ]; towers.push({ x: slot[0], z: slot[1], lastShot: 0 }); }
  else if (item === 'repair') { gate.hp = Math.min(gate.maxHp, gate.hp + gate.maxHp * 0.4); }
  else if (item === 'reinforce') { const add = gate.maxHp * 0.25; gate.maxHp += add; gate.hp += add; }
  else if (item === 'heal') { king.hp = Math.min(king.maxHp, king.hp + king.maxHp * 0.35 + 1000); }
  else if (item === 'guards') { waveBonus += 2; }
  else if (item === 'might' || item === 'swift' || item === 'reach') { if (king.up[item] >= KING_UP_MAX) return; king.up[item]++; }
  gold -= cfg.cost; broadcast({ t: 'ev', kind: 'bought', item });
}

// ---------- combat / gathering ----------
function playerFire(id) {
  const p = players.get(id); if (!p || !p.alive || phase !== 'combat') return;
  const w = WEAPONS[p.wep]; const t = now();
  if (t - p.lastShot < w.cd) return; p.lastShot = t;
  // LEFT forest -> chop wood
  const tree = nearestNode(trees, p.x, p.z, CHOP.radius);
  if (tree) { tree.hp -= CHOP.dmg; fxQueue.push({ k: 'chop', x: tree.x, z: tree.z }); if (tree.hp <= 0) { tree.alive = false; tree.regrowAt = t + FOREST.regrowMs; wood += CHOP.woodPerTree; fxQueue.push({ k: 'treefell', x: tree.x, z: tree.z }); maybeDeployRam(); } return; }
  // RIGHT quarry -> mine iron
  const orev = nearestNode(irons, p.x, p.z, IRON.radius);
  if (orev) { orev.hp -= MINE_DMG; fxQueue.push({ k: 'mine', x: orev.x, z: orev.z }); if (orev.hp <= 0) { orev.alive = false; orev.regrowAt = t + IRON.regrowMs; iron += IRON.ironPer; fxQueue.push({ k: 'minegold', x: orev.x, z: orev.z }); maybeDeployRam(); } return; }
  const dm = dmgMult(p);
  for (let i = 0; i < w.pellets; i++) { const spread = w.pellets > 1 ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.03; const a = p.a + spread; projectiles.push({ id: projId++, owner: id, wep: p.wep, x: p.x, y: 1.2, z: p.z, vx: Math.sin(a) * w.speed, vz: Math.cos(a) * w.speed, vy: w.arc ? 9 : 0, arc: w.arc, born: t, splash: w.splash, dmg: w.dmg * dm }); }
  fxQueue.push({ k: 'muzzle', x: p.x, z: p.z, c: w.color });
}
function maybeDeployRam() {
  if (ram.active || phase !== 'combat') return;
  const nw = woodNeeded(), ni = ironNeeded();
  if (wood >= nw && iron >= ni) { wood -= nw; iron -= ni; ram.active = true; ram.x = 0; ram.z = RAM.startZ; broadcast({ t: 'ev', kind: 'ramdeploy' }); }
}

function damageGate(amount) { if (!gateUp()) return; gate.hp -= amount; if (gate.hp <= 0) { gate.hp = 0; broadcast({ t: 'ev', kind: 'gatebreached' }); fxQueue.push({ k: 'ramimpact', x: 0, z: LANE.wallZ }); } }
function damageKing(amount, byId) {
  if (phase !== 'combat' || gateUp() || !king.alive) return;
  king.hp -= amount; const p = players.get(byId); if (p) p.dmgDealt += amount;
  if (king.hp <= 0) { king.hp = 0; king.alive = false; endGame('attackers'); broadcast({ t: 'ev', kind: 'victory', by: byId, byName: clients.get(byId)?.name || '???' }); }
}
function damageTroop(t, amount, ownerId) { t.hp -= amount; if (t.hp <= 0) { fxQueue.push({ k: 'troopdie', x: t.x, z: t.z }); troops.delete(t.id); const p = players.get(ownerId); if (p) { p.gold += GOLD.perTroopKill; p.kills++; } } }
function damagePlayer(p, amount, src) {
  if (!p.alive) return; p.hp -= amount;
  if (p.hp <= 0) {
    p.alive = false; p.hp = 0; p.deaths++; p.respawnAt = now() + respawnDelay(p); if (phase === 'combat') gold += GOLD.perKill;
    const fx = { k: 'death', x: p.x, z: p.z, id: p.id };
    if (src) { let dx = p.x - src.x, dz = p.z - src.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; const sp = 34 + Math.random() * 16; fx.fling = 1; fx.vx = +(dx * sp).toFixed(1); fx.vz = +(dz * sp).toFixed(1); fx.vy = +(24 + Math.random() * 14).toFixed(1); }
    fxQueue.push(fx);
    broadcast({ t: 'ev', kind: 'death', id: p.id, name: clients.get(p.id)?.name || '???' });
  }
}

function kingAttack(id, kind, tx, tz) {
  if (clients.get(id)?.role !== 'king' || phase !== 'combat' || !king.alive) return;
  const cfg = KING.attacks[kind]; if (!cfg) return; const t = now(); const cdMult = Math.max(0.5, 1 - 0.12 * king.up.swift); if (t - king.cd[kind] < cfg.cd * cdMult) return; king.cd[kind] = t;
  fxQueue.push({ k: 'castlabel', x: king.x, z: king.z, y: 32, text: (clients.get(id)?.name || 'The King') + ': ' + ({ cannon: 'Catapult', slam: 'Ground Slam', sweep: 'Royal Sweep', summon: 'Summon Wave' }[kind] || kind), color: 0xffd23f });
  if (kind === 'summon') { spawnWave(waveSize()); broadcast({ t: 'ev', kind: 'kingatk', atk: 'summon' }); return; }
  let cx = king.x, cz = king.z;
  if (kind === 'cannon') { cx = clamp(+tx || 0, -LANE.halfWidth, LANE.halfWidth); cz = clamp(+tz || 0, LANE.minZ, LANE.maxZ); }
  aoePlayers(cx, cz, cfg.radius * (1 + 0.2 * king.up.reach), cfg.dmg * (1 + 0.2 * king.up.might));
  if (ram.active && Math.hypot(ram.x - cx, ram.z - cz) <= cfg.radius + 2) { ram.z = Math.min(RAM.startZ, ram.z + RAM.knockback); fxQueue.push({ k: 'ramhitback', x: ram.x, z: ram.z }); }
  fxQueue.push({ k: 'kingatk', kind, x: cx, z: cz, r: cfg.radius }); broadcast({ t: 'ev', kind: 'kingatk', atk: kind });
}
function wizardSpell(id, kind, tx, tz) {
  if (clients.get(id)?.role !== 'wizard' || !wizard || phase !== 'combat') return;
  const cfg = WIZARD.spells[kind]; if (!cfg) return; const t = now(); if (wizard.mana < cfg.mana || t - wizard.cd[kind] < cfg.cd) return;
  wizard.mana -= cfg.mana; wizard.cd[kind] = t;
  fxQueue.push({ k: 'castlabel', x: wizard.x, z: wizard.z, y: 20, text: (clients.get(id)?.name || 'The Wizard') + ': ' + ({ heal: 'Heal', meteor: 'Meteor', freeze: 'Frost Nova', rally: 'Rally' }[kind] || kind), color: 0xb07bff });
  const x = clamp(+tx || 0, -LANE.halfWidth, LANE.halfWidth), z = clamp(+tz || 0, LANE.minZ, LANE.maxZ);
  if (kind === 'heal') { king.hp = Math.min(king.maxHp, king.hp + cfg.amount); fxQueue.push({ k: 'heal', x: king.x, z: king.z }); }
  else if (kind === 'meteor') { aoePlayers(x, z, cfg.radius, cfg.dmg); fxQueue.push({ k: 'meteor', x, z, r: cfg.radius }); }
  else if (kind === 'freeze') { for (const p of players.values()) if (p.alive && Math.hypot(p.x - x, p.z - z) <= cfg.radius) p.slowUntil = t + cfg.dur; fxQueue.push({ k: 'freeze', x, z, r: cfg.radius }); }
  else if (kind === 'rally') { spawnWave(Math.ceil(waveSize() * 0.6)); fxQueue.push({ k: 'rally', x: king.x, z: king.z }); }
  broadcast({ t: 'ev', kind: 'spell', spell: kind });
}
function aoePlayers(x, z, radius, dmg) { for (const p of players.values()) { if (!p.alive) continue; const d = Math.hypot(p.x - x, p.z - z); if (d <= radius) damagePlayer(p, dmg * (1 - (d / radius) * 0.5), { x, z }); } }

// ---------- troops ----------
function waveSize() { return clamp(Math.round(attackerCount() * WAVE.perPlayer) + waveBonus + (round - 1), WAVE.minPerWave, WAVE.maxPerWave + 8); }
function maxAlive() { return Math.min(WAVE.maxAliveHardCap, Math.round(WAVE.maxAliveBase + WAVE.maxAlivePerPlayer * attackerCount()) + waveBonus * 2); }
function spawnWave(n) { if (NO_TROOPS) return; const room = maxAlive() - guardCount(); n = Math.min(n, room); if (n <= 0) return; for (let i = 0; i < n; i++) { troops.set(troopId, { id: troopId, x: (Math.random() - 0.5) * LANE.halfWidth * 1.8, z: LANE.troopSpawnZ + (Math.random() - 0.5) * 4, hp: TROOP.hp + (round - 1) * 12, lastAtk: 0 }); troopId++; } fxQueue.push({ k: 'wave', x: 0, z: LANE.troopSpawnZ }); }

function resetGame() {
  phase = 'lobby'; round = 0; result = null; waveBonus = 0; towers.length = 0;
  gold = TEST_GOLD != null ? TEST_GOLD : GOLD.start;
  king.alive = true; king.x = 0; king.z = LANE.kingZ; king.mx = 0; king.mz = 0; king.cd = { slam: 0, cannon: 0, sweep: 0, summon: 0 }; king.up = { might: 0, swift: 0, reach: 0 };
  projectiles = []; troops.clear(); initForest(); initIron(); wood = 0; iron = 0; ram = { active: false, x: 0, z: RAM.startZ };
  if (wizard) { wizard.mana = WIZARD.maxMana; wizard.cd = { heal: 0, meteor: 0, freeze: 0, rally: 0 }; }
  for (const p of players.values()) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = PLAYER.maxHp; p.alive = true; p.wep = 'blaster'; p.kills = 0; p.deaths = 0; p.dmgDealt = 0; p.gold = TEST_PGOLD != null ? TEST_PGOLD : 0; p.perks = { tough: 0, dmg: 0, respawn: 0, swift: 0 }; p.perkRound = -1; }
  recomputeDefenses(); broadcast({ t: 'ev', kind: 'reset' });
}

// ---------- tick ----------
let last = Date.now();
setInterval(() => {
  const t = now(); const dt = Math.min(0.1, (t - last) / 1000); last = t;
  if (wizard) wizard.mana = Math.min(WIZARD.maxMana, wizard.mana + WIZARD.manaRegen * dt);
  const combat = phase === 'combat';
  if (combat && t >= phaseEndsAt && king.alive) endRoundToIntermission();
  else if (phase === 'intermission' && t >= phaseEndsAt) startRound(round + 1);

  if (king.alive && (king.mx || king.mz)) { king.x = clamp(king.x + king.mx * KING.moveSpeed * dt, KING.area.minX, KING.area.maxX); king.z = clamp(king.z + king.mz * KING.moveSpeed * dt, KING.area.minZ, KING.area.maxZ); }
  if (wizard && (wizard.mx || wizard.mz)) { wizard.x = clamp(wizard.x + wizard.mx * WIZARD.moveSpeed * dt, WIZARD.area.minX, WIZARD.area.maxX); wizard.z = clamp(wizard.z + wizard.mz * WIZARD.moveSpeed * dt, WIZARD.area.minZ, WIZARD.area.maxZ); }
  for (const tr of trees.values()) if (!tr.alive && t >= tr.regrowAt) { tr.alive = true; tr.hp = TREE.hp; }
  for (const o of irons.values()) if (!o.alive && t >= o.regrowAt) { o.alive = true; o.hp = IRON.hp; }
  if (combat && t - lastWaveAt > WAVE.intervalMs) { lastWaveAt = t; spawnWave(waveSize()); }

  const up = gateUp();
  for (const p of players.values()) {
    if (!p.alive) { if (t >= p.respawnAt) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = effMaxHp(p); p.alive = true; } continue; }
    const spd = PLAYER.speed * speedMult(p) * (t < p.slowUntil ? 0.4 : 1);
    let nx = p.x + p.mx * spd * dt, nz = p.z + p.mz * spd * dt; [nx, nz] = clampToLane(nx, nz);
    if (up && nz < LANE.wallZ + 3.5) nz = LANE.wallZ + 3.5;   // stop attackers in FRONT of the gate (no hiding inside)
    p.x = nx; p.z = nz;
  }

  if (combat) for (const tr of troops.values()) {
    let tp = null, best = Infinity; for (const p of players.values()) { if (!p.alive) continue; const d = (p.x - tr.x) ** 2 + (p.z - tr.z) ** 2; if (d < best) { best = d; tp = p; } }
    let tx, tz; if (tp) { tx = tp.x; tz = tp.z; } else { tx = tr.x; tz = LANE.playerSpawnZ; }
    const dx = tx - tr.x, dz = tz - tr.z, d = Math.hypot(dx, dz) || 1;
    if (d > TROOP.attackRange) { tr.x += (dx / d) * TROOP.speed * dt; tr.z += (dz / d) * TROOP.speed * dt; const c = clampToLane(tr.x, tr.z); tr.x = c[0]; tr.z = c[1]; }
    else if (tp && t - tr.lastAtk > TROOP.attackCd) { tr.lastAtk = t; damagePlayer(tp, TROOP.dmg); fxQueue.push({ k: 'troophit', x: tp.x, z: tp.z }); }
  }

  if (combat) for (const tw of towers) {
    if (t - tw.lastShot < TOWER.cd) continue;
    let tp = null, best = TOWER.range * TOWER.range; for (const p of players.values()) { if (!p.alive) continue; const d = (p.x - tw.x) ** 2 + (p.z - tw.z) ** 2; if (d < best) { best = d; tp = p; } }
    if (tp) { tw.lastShot = t; damagePlayer(tp, TOWER.dmg); fxQueue.push({ k: 'arrow', x: tw.x, z: tw.z, tx: tp.x, tz: tp.z }); }
  }

  if (combat && ram.active) {
    let pushers = 0; for (const p of players.values()) if (p.alive && Math.hypot(p.x - ram.x, p.z - ram.z) <= RAM.pushRadius) pushers++;
    if (pushers > 0) ram.z -= Math.min(RAM.maxSpeed, pushers * RAM.perPusherSpeed) * dt; else ram.z = Math.min(RAM.startZ, ram.z + RAM.idleDrift * dt);
    if (ram.z <= RAM.gateZ) { ram.active = false; const dmg = Math.round((gate.maxHp || 1000) * 0.5); if (gateUp()) damageGate(dmg); else damageKing(Math.round(king.maxHp * RAM.impactDmgFrac), null); fxQueue.push({ k: 'ramimpact', x: 0, z: RAM.gateZ }); broadcast({ t: 'ev', kind: 'ramhit' }); }
  }

  const keep = [];
  for (const pr of projectiles) {
    pr.x += pr.vx * dt; pr.z += pr.vz * dt; if (pr.arc) { pr.y += pr.vy * dt; pr.vy -= 22 * dt; }
    let done = false;
    let hitT = null, hb = Infinity; for (const tr of troops.values()) { const d = (tr.x - pr.x) ** 2 + (tr.z - pr.z) ** 2; if (d < hb) { hb = d; hitT = tr; } }
    if (hitT && Math.sqrt(hb) <= TROOP.radius + 0.6) { damageTroop(hitT, pr.dmg, pr.owner); done = true; }
    if (!done && up && pr.z <= LANE.wallZ) { damageGate(pr.dmg); done = true; }
    if (!done && !up && king.alive && Math.hypot(pr.x - king.x, pr.z - king.z) <= KING.radius) { damageKing(pr.dmg, pr.owner); done = true; }
    if (!done && pr.arc && pr.y <= 0) done = true;
    if (!done && (Math.abs(pr.x) > POCKET.outerX + 8 || pr.z < LANE.minZ - 8 || pr.z > LANE.maxZ + 8 || t - pr.born > 4000)) done = true;
    if (done) {
      if (pr.splash > 0) {
        for (const tr of troops.values()) if (Math.hypot(tr.x - pr.x, tr.z - pr.z) <= pr.splash + TROOP.radius) damageTroop(tr, pr.dmg * 0.6, pr.owner);
        if (up && pr.z <= LANE.wallZ + pr.splash) damageGate(pr.dmg * 0.5);
        else if (!up && king.alive && Math.hypot(pr.x - king.x, pr.z - king.z) <= KING.radius + pr.splash) damageKing(pr.dmg * 0.5, pr.owner);
        fxQueue.push({ k: 'boom', x: pr.x, z: pr.z, r: pr.splash, c: WEAPONS[pr.wep].color });
      }
    } else keep.push(pr);
  }
  projectiles = keep;

  const ps = []; for (const p of players.values()) ps.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.a.toFixed(2), Math.round(p.hp), p.wep, p.alive ? 1 : 0, t < p.slowUntil ? 1 : 0, effMaxHp(p), p.gold]);
  const prj = projectiles.map(pr => [pr.id, +pr.x.toFixed(1), +pr.y.toFixed(1), +pr.z.toFixed(1), pr.wep]);
  const trp = []; for (const tr of troops.values()) trp.push([tr.id, +tr.x.toFixed(1), +tr.z.toFixed(1), +(tr.hp / TROOP.hp).toFixed(2)]);
  const trees_ = []; for (const tr of trees.values()) if (tr.alive) trees_.push([tr.id, +tr.x.toFixed(1), +tr.z.toFixed(1)]);
  const iron_ = []; for (const o of irons.values()) if (o.alive) iron_.push([o.id, +o.x.toFixed(1), +o.z.toFixed(1)]);
  broadcast({
    t: 's', phase, round, roundsTotal, result,
    timeLeft: (phase === 'combat' || phase === 'intermission') ? Math.max(0, phaseEndsAt - t) : 0,
    gold, gate: { hp: Math.round(gate.hp), maxHp: Math.round(gate.maxHp) },
    king: { x: +king.x.toFixed(2), z: +king.z.toFixed(2), a: +king.a.toFixed(2), hp: Math.round(king.hp), maxHp: king.maxHp, alive: king.alive ? 1 : 0, vulnerable: (!up && combat) ? 1 : 0, guards: guardCount(), up: king.up },
    wizard: wizard ? { mana: Math.round(wizard.mana), x: +wizard.x.toFixed(2), z: +wizard.z.toFixed(2), a: +wizard.a.toFixed(2) } : null,
    players: ps, proj: prj, troops: trp, trees: trees_, ironNodes: iron_,
    wood, iron, woodNeeded: woodNeeded(), ironNeeded: ironNeeded(), ram: ram.active ? { x: +ram.x.toFixed(1), z: +ram.z.toFixed(1) } : null,
    towers: towers.map(tw => [tw.x, tw.z]),
    fx: fxQueue.splice(0, fxQueue.length),
  });
}, TICK_MS);

server.listen(PORT, () => {
  const ips = []; for (const iface of Object.values(os.networkInterfaces())) for (const a of iface) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  console.log(`\n  HUNT FOR JEREMY is running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network: http://${ip}:${PORT}   <- guests scan/visit this`);
  console.log(`\n  Guests: /   |  King: /king  |  Wizard: /wizard  |  TV: /screen\n`);
});
