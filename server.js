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
  WEAPONS, WEAPON_ORDER, PLAYER_COLORS, GATE, ROUNDS, GOLD, TOWER, SHOP, KING_UP_MAX, WEAPON_BUY, WEAPON_BUY_ORDER, ARCHER,
  PERKS, PERK_FX, PERK_ORDER, PERK_BUY, PERK_MAX, PACK, BUILDS, FRIENDLY, CANNON, ABILITIES, TUNE, clampToLane,
  COSMETICS, COSMETIC_SLOTS,
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
    const ext = path.extname(filePath);
    // App code (html/js/json) is never cached, so every deploy is instantly live -- no stale scene.js, no Cloudflare purge.
    // Big stable third-party assets (vendor libs, images) cache for a day to save phone bandwidth at the party.
    const stable = filePath.includes(path.join(PUBLIC, 'vendor')) || ['.png', '.ico', '.svg'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': stable ? 'public, max-age=86400' : 'no-cache, must-revalidate',
    });
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
// The ram is a dump-built site: players haul wood/iron and dump it in (bw/bi) until it's built, then it deploys & is pushable.
let ram = { built: false, active: false, x: 0, z: RAM.startZ, bw: 0, bi: 0 };
const builds = new Map();           // other dump-built structures (hospital, troop camp, ...)
let friendlyId = 1; const friendlies = new Map();   // friendly troops sent by built troop camps
const TEST_BUILD = ENVN('BUILD_NEED');   // test override: force every build's wood/iron cost to this
function initBuilds() { builds.clear(); for (const b of BUILDS) builds.set(b.id, { id: b.id, kind: b.kind, x: b.x, z: b.z, needW: TEST_BUILD != null ? TEST_BUILD : b.needW, needI: TEST_BUILD != null ? TEST_BUILD : b.needI, maxHp: b.hp, r: b.r, destructible: b.destructible !== false, cfg: b, bw: 0, bi: 0, built: false, hp: b.hp, lastSpawn: 0 }); }
initBuilds();
// The CANNON: a destructible front-line emplacement (dump IRON to build; crew 3 stations to aim & fire).
let cannon = { built: false, bi: 0, hp: CANNON.hp, aim: 0, range: (CANNON.rangeMin + CANNON.rangeMax) / 2, lastFire: 0, tUntil: 0, tDir: 1, eUntil: 0, eDir: 1 };
function initCannon() { const need = TEST_BUILD != null ? TEST_BUILD : CANNON.needI; cannon = { built: false, bi: 0, needI: need, hp: CANNON.hp, aim: 0, range: (CANNON.rangeMin + CANNON.rangeMax) / 2, lastFire: 0, tUntil: 0, tDir: 1, eUntil: 0, eDir: 1 }; }
initCannon();
const d2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
function fireCannon(id) {
  const tx = clamp(CANNON.x + Math.sin(cannon.aim) * cannon.range, -LANE.halfWidth, LANE.halfWidth);
  const tz = clamp(CANNON.z - Math.cos(cannon.aim) * cannon.range, LANE.minZ, LANE.maxZ);
  const T = 2.2, g = 22, y0 = CANNON.platformY + 2;   // long high MORTAR lob; vy tuned so the shell LANDS exactly on the target (where the marker shows)
  projectiles.push({ id: projId++, owner: id, wep: 'rocket', x: CANNON.x, y: y0, z: CANNON.z, vx: (tx - CANNON.x) / T, vz: (tz - CANNON.z) / T, vy: 0.5 * g * T - y0 / T, arc: true, born: now(), splash: CANNON.shellSplash, dmg: CANNON.shellDmg, antiUnit: 1, landOnly: 1 });
  fxQueue.push({ k: 'muzzle', x: CANNON.x, z: CANNON.z, c: 0xffaa44 });
}
function aoeTroopsAt(x, z, radius, dmg, ownerId) { for (const tr of troops.values()) if (Math.hypot(tr.x - x, tr.z - z) <= radius + TROOP.radius) damageTroop(tr, dmg, ownerId); }
// Class active ability (Dash is handled client-side; the damage ones run here, trusting the client's cooldown).
function playerAbility(id) {
  const p = players.get(id); if (!p || !p.alive || phase !== 'combat') return;
  const ab = ABILITIES[p.cls]; if (!ab || ab.kind === 'dash') return;
  const t = now(); if (t - (p.abilityAt || 0) < ab.cd) return; p.abilityAt = t;
  const dm = dmgMult(p);
  if (ab.kind === 'whirl') { aoeTroopsAt(p.x, p.z, ab.radius, ab.dmg * dm, id); fxQueue.push({ k: 'boom', x: p.x, z: p.z, r: ab.radius, c: 0xffaa33 }); }
  else if (ab.kind === 'napalm') {
    const nx = clamp(p.x + Math.sin(p.a) * ab.range, -LANE.halfWidth, LANE.halfWidth), nz = clamp(p.z + Math.cos(p.a) * ab.range, LANE.minZ, LANE.maxZ);
    aoeTroopsAt(nx, nz, ab.radius, ab.dmg * dm, id);
    if (gateUp() && nz <= LANE.wallZ + ab.radius) damageGate(ab.dmg * dm);
    else if (!gateUp() && king.alive && Math.hypot(nx - king.x, nz - king.z) <= KING.radius + ab.radius) damageKing(ab.dmg * dm, id);
    fxQueue.push({ k: 'boom', x: nx, z: nz, r: ab.radius, c: 0xff5522 });
  }
  else if (ab.kind === 'pierce') {
    const dxa = Math.sin(p.a), dza = Math.cos(p.a);
    for (const tr of troops.values()) { const rx = tr.x - p.x, rz = tr.z - p.z; const fwd = rx * dxa + rz * dza, lat = Math.abs(rx * dza - rz * dxa); if (fwd > 0 && fwd < ab.range && lat < ab.width) damageTroop(tr, ab.dmg * dm, id); }
    { const rx = -p.x, rz = LANE.wallZ - p.z; const fwd = rx * dxa + rz * dza, lat = Math.abs(rx * dza - rz * dxa); if (fwd > 0 && fwd < ab.range && lat < ab.width + 2) { if (gateUp()) damageGate(ab.dmg * dm); else if (king.alive) damageKing(ab.dmg * dm, id); } }
    fxQueue.push({ k: 'arrow', x: p.x, z: p.z, tx: p.x + dxa * ab.range, tz: p.z + dza * ab.range });
  }
  else if (ab.kind === 'bombard') {
    const tx = clamp(p.x + Math.sin(p.a) * ab.range, -LANE.halfWidth, LANE.halfWidth), tz = clamp(p.z + Math.cos(p.a) * ab.range, LANE.minZ, LANE.maxZ); const T = 1.3;
    projectiles.push({ id: projId++, owner: id, wep: 'rocket', x: p.x, y: 1.5, z: p.z, vx: (tx - p.x) / T, vz: (tz - p.z) / T, vy: 0.5 * 22 * T, arc: true, born: t, splash: ab.splash, dmg: ab.dmg * dm });
    fxQueue.push({ k: 'muzzle', x: p.x, z: p.z, c: 0x8a7866 });
  }
  const c = clients.get(id); if (c) send(c.ws, { t: 'ev', kind: 'abilityok' });
}

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
const king = { x: 0, z: LANE.kingZ, a: 0, mx: 0, mz: 0, hp: 0, maxHp: 0, alive: true, cd: { slam: 0, cannon: 0, sweep: 0, summon: 0 }, gateOpen: false, up: { might: 0, swift: 0, reach: 0 } };
let wizard = null;

const attackerCount = () => players.size;
const gateUp = () => gate.hp > 0 && !king.gateOpen;   // King vulnerable when the gate is smashed OR he has it open to sally

// ---- live balance knobs (host dashboard sets these via the 'tune' message) ----
const tune = { kingHp: 1, gateHp: 1, waveSize: 1, troopDmg: 1, playerDmg: 1, waveRate: 1 };
function kingBaseHp() { return TEST_HP != null ? TEST_HP : (KING.baseHp + KING.hpPerPlayer * Math.max(1, attackerCount())); }
function gateBaseHp() { return TEST_GATE != null ? TEST_GATE : (GATE.baseHp + GATE.hpPerPlayer * Math.max(1, attackerCount())); }
function recomputeDefenses() {
  if (phase !== 'lobby') return;
  king.maxHp = Math.round(kingBaseHp() * tune.kingHp); king.hp = king.maxHp;
  gate.maxHp = Math.round(gateBaseHp() * tune.gateHp); gate.hp = gate.maxHp;
}
function applyTune(k) {   // live-apply HP changes mid-match, preserving the current HP fraction
  if (k === 'kingHp') { const nm = Math.round(kingBaseHp() * tune.kingHp), f = king.maxHp ? king.hp / king.maxHp : 1; king.maxHp = nm; king.hp = Math.round(nm * f); }
  else if (k === 'gateHp') { const nm = Math.round(gateBaseHp() * tune.gateHp), f = gate.maxHp ? gate.hp / gate.maxHp : 1; gate.maxHp = nm; gate.hp = Math.round(nm * f); }
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

function playerSpawn() { return [(Math.random() - 0.5) * 16, LANE.playerSpawnZ - Math.random() * 6]; }   // center-back of the camp
function addPlayer(id, cls) { const [x, z] = playerSpawn(); const wep = WEAPON_ORDER.includes(cls) ? cls : 'blaster'; players.set(id, { id, x, z, a: Math.PI, mx: 0, mz: 0, hp: PLAYER.maxHp, alive: true, wep, cls: wep, abilityAt: 0, lastShot: 0, respawnAt: 0, slowUntil: 0, kills: 0, deaths: 0, dmgDealt: 0, gold: TEST_PGOLD != null ? TEST_PGOLD : 0, carry: { w: 0, i: 0 }, perks: { tough: 0, dmg: 0, respawn: 0, swift: 0 }, perkRound: -1, cos: { hat: 'none', cape: 'none', helmet: 'none' }, cosOwned: [] }); recomputeDefenses(); }

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
      if (role === 'player') addPlayer(id, m.class);
      if (role === 'wizard') wizard = { mana: WIZARD.maxMana, cd: { heal: 0, meteor: 0, freeze: 0, rally: 0 }, x: -14, z: LANE.kingZ, a: 0, mx: 0, mz: 0 };
      send(ws, { t: 'welcome', id, role, lane: LANE, weapons: WEAPONS, weaponOrder: WEAPON_ORDER, king: { radius: KING.radius, attacks: KING.attacks }, wizard: { maxMana: WIZARD.maxMana, spells: WIZARD.spells }, shop: SHOP, roundsTotal, perks: PERKS, perkOrder: PERK_ORDER, perkBuy: PERK_BUY, perkMax: PERK_MAX, weaponBuy: WEAPON_BUY, weaponBuyOrder: WEAPON_BUY_ORDER, camp: CAMP, cosmetics: COSMETICS, cosmeticSlots: COSMETIC_SLOTS, tune, tuneMeta: TUNE });
      broadcastRoster();
      break;
    }
    case 'in': { const p = players.get(id); if (!p) return; p.mx = clamp(+m.mx || 0, -1, 1); p.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') p.a = m.a; break; }
    // Client-authoritative position: the client simulates its own movement and reports it.
    // We trust x/z but still clamp to the lane and in front of a standing gate so nobody
    // can walk through walls / into the castle and break the game (integrity, not anti-cheat).
    case 'pos': { const p = players.get(id); if (!p || !p.alive) break; if (p.spawnGuard && now() < p.spawnGuard) break; let nx = +m.x, nz = +m.z; if (!Number.isFinite(nx) || !Number.isFinite(nz)) break; [nx, nz] = clampToLane(nx, nz, (!gateUp() && phase === 'combat') ? LANE.duelZ : undefined); if (gateUp() && phase === 'combat' && nz < LANE.wallZ + 3.5) nz = LANE.wallZ + 3.5; p.x = nx; p.z = nz; if (typeof m.a === 'number') p.a = m.a; break; }
    case 'fire': playerFire(id); break;
    case 'ability': playerAbility(id); break;
    case 'kmove': { if (clients.get(id)?.role !== 'king') return; king.mx = clamp(+m.mx || 0, -1, 1); king.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') king.a = m.a; break; }
    case 'wmove': { if (clients.get(id)?.role !== 'wizard' || !wizard) return; wizard.mx = clamp(+m.mx || 0, -1, 1); wizard.mz = clamp(+m.mz || 0, -1, 1); if (typeof m.a === 'number') wizard.a = m.a; break; }
    // Client-authoritative King / Wizard position (same approach as players), clamped to their roam area.
    case 'kpos': { if (clients.get(id)?.role !== 'king') return; const nx = +m.x, nz = +m.z; if (!Number.isFinite(nx) || !Number.isFinite(nz)) break; const fwd = (king.gateOpen || gate.hp <= 0) ? KING.sallyZ : KING.area.maxZ; king.x = clamp(nx, KING.area.minX, KING.area.maxX); king.z = clamp(nz, KING.area.minZ, fwd); if (typeof m.a === 'number') king.a = m.a; break; }
    case 'gate': { if (clients.get(id)?.role !== 'king') return; if (king.gateOpen) { if (king.z <= LANE.wallZ - 2) king.gateOpen = false; } else king.gateOpen = true; break; }
    case 'wpos': { if (clients.get(id)?.role !== 'wizard' || !wizard) return; const nx = +m.x, nz = +m.z; if (!Number.isFinite(nx) || !Number.isFinite(nz)) break; wizard.x = clamp(nx, WIZARD.area.minX, WIZARD.area.maxX); wizard.z = clamp(nz, WIZARD.area.minZ, WIZARD.area.maxZ); if (typeof m.a === 'number') wizard.a = m.a; break; }
    case 'katk': kingAttack(id, m.kind, +m.x, +m.z); break;
    case 'spell': wizardSpell(id, m.kind, +m.x, +m.z); break;
    // Buy an Armor/upgrade at the camp's left stall with personal gold. Walk-up, combat OR intermission, stacks to PERK_MAX.
    case 'buyperk': { const p = players.get(id); if (!p || !PERK_BUY[m.perk]) break; if (phase !== 'combat' && phase !== 'intermission') break; const near = Math.hypot(p.x - CAMP.armorer.x, p.z - CAMP.armorer.z) <= CAMP.armorer.r + 1.5; if (!near) break; const owned = p.perks[m.perk] || 0; if (owned >= PERK_MAX) break; const cost = PERK_BUY[m.perk] * (owned + 1); if (p.gold < cost) break; p.gold -= cost; p.perks[m.perk] = owned + 1; if (m.perk === 'tough') p.hp = Math.min(effMaxHp(p), p.hp + PERK_FX.hp); send(ws, { t: 'ev', kind: 'boughtperk', perk: m.perk, lvl: owned + 1, cost }); break; }
    case 'buyweapon': { const p = players.get(id); if (!p || !WEAPON_BUY[m.w]) break; const nearArmory = Math.hypot(p.x - CAMP.armory.x, p.z - CAMP.armory.z) <= CAMP.armory.r; if ((phase === 'intermission' || (phase === 'combat' && nearArmory))) { const cost = WEAPON_BUY[m.w]; if (p.gold >= cost && p.wep !== m.w) { p.gold -= cost; p.wep = m.w; send(ws, { t: 'ev', kind: 'boughtweapon', w: m.w }); } } break; }
    case 'buycosmetic': { const p = players.get(id); if (!p) break; if (phase !== 'combat' && phase !== 'intermission') break; const near = Math.hypot(p.x - CAMP.cosmetics.x, p.z - CAMP.cosmetics.z) <= CAMP.cosmetics.r + 1.5; if (!near) break; const slot = m.slot; if (!COSMETIC_SLOTS.includes(slot)) break; const item = (COSMETICS[slot] || []).find(c => c.id === m.id); if (!item) break; const key = slot + ':' + item.id; const owns = item.cost === 0 || p.cosOwned.includes(key); if (!owns) { if (p.gold < item.cost) break; p.gold -= item.cost; p.cosOwned.push(key); } p.cos[slot] = item.id; broadcastRoster(); send(ws, { t: 'ev', kind: 'boughtcosmetic', slot, id: item.id, owned: p.cosOwned, gold: p.gold }); break; }
    case 'start': if (isDefender(id) && phase === 'lobby') startRound(1); break;
    case 'nextround': if (isDefender(id) && phase === 'intermission') startRound(round + 1); break;
    case 'buy': if (isDefender(id)) buy(m.item); break;
    case 'reset': if (isDefender(id)) resetGame(); break;
    case 'tune': { if (!isDefender(id)) break; const k = m.key; if (tune[k] === undefined) break; tune[k] = clamp(+m.val || 1, 0.1, 10); applyTune(k); broadcast({ t: 'ev', kind: 'tune', tune }); break; }
  }
}
function broadcastRoster() {
  const roster = [];
  for (const [cid, c] of clients) if (c.role === 'player') roster.push([cid, c.name, c.color, players.get(cid)?.cos || null]);
  const kingC = [...clients.values()].find(c => c.role === 'king');
  const wizC = [...clients.values()].find(c => c.role === 'wizard');
  broadcast({ t: 'roster', players: roster, kingName: kingC?.name || null, wizardName: wizC?.name || null, count: roster.length });
}

// ---------- rounds ----------
function startRound(n) {
  round = n; phase = 'combat'; phaseEndsAt = now() + combatMs; lastWaveAt = now();
  for (const p of players.values()) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = effMaxHp(p); p.alive = true; }
  ram = { built: false, active: false, x: 0, z: RAM.startZ, bw: 0, bi: 0 };   // fresh ram frame each round
  troops.clear(); friendlies.clear(); spawnWave(waveSize());   // cannon + camp builds PERSIST across rounds (permanent upgrades)
  broadcast({ t: 'ev', kind: 'round', round: n, total: roundsTotal });
}
function endRoundToIntermission() {
  gold += GOLD.perRoundBase + GOLD.perRoundPerPlayer * attackerCount();
  troops.clear(); projectiles = [];
  king.gateOpen = false; king.x = 0; king.z = LANE.kingZ;   // intermission: pull Jeremy back inside and shut the gate
  if (round >= roundsTotal) { endGame('king'); return; }
  phase = 'intermission'; phaseEndsAt = now() + interMs;
  broadcast({ t: 'ev', kind: 'intermission', round, gold });
}
function endGame(who) { phase = 'over'; result = who; phaseEndsAt = now() + 14000; broadcast({ t: 'ev', kind: 'gameover', result: who }); }   // auto-return to lobby ~14s later
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

// A destructible built structure (trebuchet) takes damage; when it drops it resets to an empty pad to rebuild.
function damageBuildStruct(b, dmg) {
  if (!b.built || !b.destructible) return;
  b.hp -= dmg;
  if (b.hp <= 0) { b.built = false; b.bw = 0; b.bi = 0; b.hp = b.maxHp; fxQueue.push({ k: 'boom', x: b.x, z: b.z, r: 7, c: 0xff7733 }); broadcast({ t: 'ev', kind: 'builddown', what: b.kind }); }
}
// ---------- combat / gathering ----------
const GATHER_CD = 250;   // fixed ms between chops/mines/dumps — same for EVERY class, independent of weapon fire rate
function playerFire(id) {
  const p = players.get(id); if (!p || !p.alive || (phase !== 'combat' && phase !== 'intermission')) return;
  const w = WEAPONS[p.wep]; const t = now();
  // GATHER / DUMP at a FIXED cadence so a slow weapon (Catapult) mines just as fast as a fast one.
  if (t - (p.lastGather || 0) >= GATHER_CD) {
    // Build sites take PRIORITY over chopping/mining, so standing beside a tree/ore doesn't hijack a dump or treb-fire.
    let onBuild = false;
    if (!ram.built && Math.hypot(p.x - ram.x, p.z - ram.z) <= RAM.pushRadius) { onBuild = true; if ((p.carry.w > 0 && ram.bw < woodNeeded()) || (p.carry.i > 0 && ram.bi < ironNeeded())) { p.lastGather = t; dumpIntoRam(p); return; } }
    for (const b of builds.values()) { if (Math.hypot(p.x - b.x, p.z - b.z) > b.r + 3) continue; onBuild = true; if (!b.built && ((p.carry.w > 0 && b.bw < b.needW) || (p.carry.i > 0 && b.bi < b.needI))) { p.lastGather = t; dumpIntoBuild(p, b); return; } }
    if (!onBuild) {
      const tree = nearestNode(trees, p.x, p.z, CHOP.radius);
      if (tree) { p.lastGather = t; tree.hp -= CHOP.dmg; fxQueue.push({ k: 'chop', x: tree.x, z: tree.z }); if (tree.hp <= 0) { tree.alive = false; tree.regrowAt = t + FOREST.regrowMs; p.carry.w = Math.min(PACK.cap, p.carry.w + CHOP.woodPerTree); fxQueue.push({ k: 'treefell', x: tree.x, z: tree.z }); } return; }
      const orev = nearestNode(irons, p.x, p.z, IRON.radius);
      if (orev) { p.lastGather = t; orev.hp -= MINE_DMG; fxQueue.push({ k: 'mine', x: orev.x, z: orev.z }); if (orev.hp <= 0) { orev.alive = false; orev.regrowAt = t + IRON.regrowMs; p.carry.i = Math.min(PACK.cap, p.carry.i + IRON.ironPer); fxQueue.push({ k: 'minegold', x: orev.x, z: orev.z }); } return; }
    }
  }
  // WEAPON FIRE: combat only, gated by the weapon's own cooldown.
  if (phase !== 'combat') return;
  // Operate a built trebuchet you're standing at: spend 1 iron to lob a gate-only shot.
  for (const b of builds.values()) {
    if (b.kind !== 'trebuchet' || !b.built || Math.hypot(p.x - b.x, p.z - b.z) > b.r + 3) continue;
    if (p.carry.i > 0 && t - (b.lastFire || 0) >= b.cfg.fireMs) { p.carry.i -= 1; b.lastFire = t; const T = 1.6; projectiles.push({ id: projId++, owner: id, gateOnly: true, wep: 'rocket', x: b.x, y: 7, z: b.z, vx: (0 - b.x) / T, vz: ((LANE.wallZ - 2) - b.z) / T, vy: 0.5 * 22 * T, arc: true, born: t, splash: b.cfg.splash, dmg: b.cfg.dmg }); fxQueue.push({ k: 'muzzle', x: b.x, z: b.z, c: 0xffd23f }); }
    return;
  }
  // Crew the rear super-cannon: dump IRON to build it, then crank the cogs (aim L/R, range up/down) and fire the breech at the field.
  if (Math.hypot(p.x - CANNON.x, p.z - CANNON.z) <= CANNON.platformR + 2) {
    if (!cannon.built) {
      if (p.carry.i > 0 && cannon.bi < cannon.needI) { const ti = Math.min(p.carry.i, cannon.needI - cannon.bi); cannon.bi += ti; p.carry.i -= ti; fxQueue.push({ k: 'minegold', x: CANNON.x, z: CANNON.z }); if (cannon.bi >= cannon.needI) { cannon.built = true; cannon.hp = CANNON.hp; broadcast({ t: 'ev', kind: 'built', what: 'cannon' }); } }
    } else if (Math.hypot(p.x - CANNON.x, p.z - (CANNON.z + CANNON.breechDZ)) <= CANNON.stationR) {
      if (p.carry.i > 0 && t - cannon.lastFire >= CANNON.reload) { p.carry.i -= 1; cannon.lastFire = t; fireCannon(id); }
    } else if (Math.hypot(p.x - (CANNON.x - CANNON.cogDX), p.z - CANNON.z) <= CANNON.stationR) { cannon.tUntil = t + 250; }
    else if (Math.hypot(p.x - (CANNON.x + CANNON.cogDX), p.z - CANNON.z) <= CANNON.stationR) { cannon.eUntil = t + 250; }
    return;
  }
  if (t - p.lastShot < w.cd) return; p.lastShot = t;
  const dm = dmgMult(p);
  for (let i = 0; i < w.pellets; i++) { const spread = w.pellets > 1 ? (Math.random() - 0.5) * 0.34 : (Math.random() - 0.5) * 0.03; const a = p.a + spread; projectiles.push({ id: projId++, owner: id, wep: p.wep, x: p.x, y: 1.2, z: p.z, ox: p.x, oz: p.z, range: w.range || 80, vx: Math.sin(a) * w.speed, vz: Math.cos(a) * w.speed, vy: w.arc ? 9 : 0, arc: w.arc, born: t, splash: w.splash, dmg: w.dmg * dm * tune.playerDmg }); }
  fxQueue.push({ k: 'muzzle', x: p.x, z: p.z, c: w.color });
}
function dumpIntoRam(p) {
  if (ram.built) return;
  const needW = woodNeeded(), needI = ironNeeded();
  const tw = Math.min(p.carry.w, Math.max(0, needW - ram.bw)); ram.bw += tw; p.carry.w -= tw;
  const ti = Math.min(p.carry.i, Math.max(0, needI - ram.bi)); ram.bi += ti; p.carry.i -= ti;
  if (tw || ti) fxQueue.push({ k: 'minegold', x: ram.x, z: ram.z });
  if (ram.bw >= needW && ram.bi >= needI) { ram.built = true; ram.active = true; ram.x = 0; ram.z = RAM.startZ; broadcast({ t: 'ev', kind: 'ramdeploy' }); }
}
function dumpIntoBuild(p, b) {
  if (b.built) return;
  const tw = Math.min(p.carry.w, Math.max(0, b.needW - b.bw)); b.bw += tw; p.carry.w -= tw;
  const ti = Math.min(p.carry.i, Math.max(0, b.needI - b.bi)); b.bi += ti; p.carry.i -= ti;
  if (tw || ti) fxQueue.push({ k: 'minegold', x: b.x, z: b.z });
  if (b.bw >= b.needW && b.bi >= b.needI) { b.built = true; b.hp = b.maxHp; b.lastSpawn = now(); broadcast({ t: 'ev', kind: 'built', what: b.kind }); }
}
function damageBuild(b, amount) { if (!b.built) return; b.hp -= amount; if (b.hp <= 0) { b.built = false; b.bw = 0; b.bi = 0; b.hp = b.maxHp; fxQueue.push({ k: 'boom', x: b.x, z: b.z, r: 6, c: 0xff7733 }); broadcast({ t: 'ev', kind: 'builddown', what: b.kind }); } }

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
  // CAMP.z0 - 5: the King can't bombard the attackers' home base (stops ~5 units in front of the camp fence).
  if (kind === 'cannon') { cx = clamp(+tx || 0, -LANE.halfWidth, LANE.halfWidth); cz = clamp(+tz || 0, LANE.minZ, CAMP.z0 - 5); }
  aoePlayers(cx, cz, cfg.radius * (1 + 0.2 * king.up.reach), cfg.dmg * (1 + 0.2 * king.up.might));
  aoeBuildsFriendlies(cx, cz, cfg.radius * (1 + 0.2 * king.up.reach), cfg.dmg * (1 + 0.2 * king.up.might));
  if (ram.active && Math.hypot(ram.x - cx, ram.z - cz) <= cfg.radius + 2) { ram.z = Math.min(RAM.startZ, ram.z + RAM.knockback); fxQueue.push({ k: 'ramhitback', x: ram.x, z: ram.z }); }
  fxQueue.push({ k: 'kingatk', kind, x: cx, z: cz, r: cfg.radius }); broadcast({ t: 'ev', kind: 'kingatk', atk: kind });
}
function wizardSpell(id, kind, tx, tz) {
  if (clients.get(id)?.role !== 'wizard' || !wizard || phase !== 'combat') return;
  const cfg = WIZARD.spells[kind]; if (!cfg) return; const t = now(); if (wizard.mana < cfg.mana || t - wizard.cd[kind] < cfg.cd) return;
  wizard.mana -= cfg.mana; wizard.cd[kind] = t;
  fxQueue.push({ k: 'castlabel', x: wizard.x, z: wizard.z, y: 20, text: (clients.get(id)?.name || 'The Wizard') + ': ' + ({ heal: 'Heal', meteor: 'Meteor', freeze: 'Frost Nova', rally: 'Rally' }[kind] || kind), color: 0xb07bff });
  const x = clamp(+tx || 0, -LANE.halfWidth, LANE.halfWidth), z = clamp(+tz || 0, LANE.minZ, CAMP.z0 - 5);   // no bombarding the home base
  if (kind === 'heal') { king.hp = Math.min(king.maxHp, king.hp + cfg.amount); fxQueue.push({ k: 'heal', x: king.x, z: king.z }); }
  else if (kind === 'meteor') { aoePlayers(x, z, cfg.radius, cfg.dmg); fxQueue.push({ k: 'meteor', x, z, r: cfg.radius }); }
  else if (kind === 'freeze') { for (const p of players.values()) if (p.alive && Math.hypot(p.x - x, p.z - z) <= cfg.radius) p.slowUntil = t + cfg.dur; fxQueue.push({ k: 'freeze', x, z, r: cfg.radius }); }
  else if (kind === 'rally') { spawnWave(Math.ceil(waveSize() * 0.6)); fxQueue.push({ k: 'rally', x: king.x, z: king.z }); }
  broadcast({ t: 'ev', kind: 'spell', spell: kind });
}
function aoePlayers(x, z, radius, dmg) { for (const p of players.values()) { if (!p.alive) continue; const d = Math.hypot(p.x - x, p.z - z); if (d <= radius) damagePlayer(p, dmg * (1 - (d / radius) * 0.5), { x, z }); } }
// The King's AoE attacks also wreck structures and friendly troops caught in the blast.
function aoeBuildsFriendlies(x, z, radius, dmg) {
  for (const b of builds.values()) if (b.built && b.destructible && Math.hypot(b.x - x, b.z - z) <= radius + b.r) damageBuild(b, dmg);
  for (const f of friendlies.values()) if (Math.hypot(f.x - x, f.z - z) <= radius) { f.hp -= dmg; if (f.hp <= 0) { fxQueue.push({ k: 'troopdie', x: f.x, z: f.z }); friendlies.delete(f.id); } }
  if (cannon.built && Math.hypot(CANNON.x - x, CANNON.z - z) <= radius + CANNON.r) { cannon.hp -= dmg; if (cannon.hp <= 0) { fxQueue.push({ k: 'boom', x: CANNON.x, z: CANNON.z, r: 8, c: 0xff7733 }); initCannon(); broadcast({ t: 'ev', kind: 'builddown', what: 'cannon' }); } }
}

// ---------- troops ----------
function waveSize() { return clamp(Math.round((attackerCount() * WAVE.perPlayer + waveBonus + (round - 1)) * tune.waveSize), WAVE.minPerWave, WAVE.maxPerWave + 8); }
function maxAlive() { return Math.min(WAVE.maxAliveHardCap, Math.round(WAVE.maxAliveBase + WAVE.maxAlivePerPlayer * attackerCount()) + waveBonus * 2); }
function spawnWave(n) { if (NO_TROOPS) return; const room = maxAlive() - guardCount(); n = Math.min(n, room); if (n <= 0) return; for (let i = 0; i < n; i++) { troops.set(troopId, { id: troopId, x: (Math.random() - 0.5) * LANE.halfWidth * 1.8, z: LANE.troopSpawnZ + (Math.random() - 0.5) * 4, hp: TROOP.hp + (round - 1) * 12, lastAtk: 0, kind: Math.random() < ARCHER.frac ? 'archer' : 'melee' }); troopId++; } fxQueue.push({ k: 'wave', x: 0, z: LANE.troopSpawnZ }); }

function resetGame() {
  phase = 'lobby'; round = 0; result = null; waveBonus = 0; towers.length = 0;
  gold = TEST_GOLD != null ? TEST_GOLD : GOLD.start;
  king.alive = true; king.x = 0; king.z = LANE.kingZ; king.mx = 0; king.mz = 0; king.cd = { slam: 0, cannon: 0, sweep: 0, summon: 0 }; king.gateOpen = false; king.up = { might: 0, swift: 0, reach: 0 };
  projectiles = []; troops.clear(); friendlies.clear(); initForest(); initIron(); initBuilds(); initCannon(); ram = { built: false, active: false, x: 0, z: RAM.startZ, bw: 0, bi: 0 };
  if (wizard) { wizard.mana = WIZARD.maxMana; wizard.cd = { heal: 0, meteor: 0, freeze: 0, rally: 0 }; }
  for (const p of players.values()) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = PLAYER.maxHp; p.alive = true; p.wep = p.cls || 'blaster'; p.carry = { w: 0, i: 0 }; p.kills = 0; p.deaths = 0; p.dmgDealt = 0; p.gold = TEST_PGOLD != null ? TEST_PGOLD : 0; p.perks = { tough: 0, dmg: 0, respawn: 0, swift: 0 }; p.perkRound = -1; }
  recomputeDefenses(); broadcast({ t: 'ev', kind: 'reset' });
}

// ---------- tick ----------
let last = Date.now();
let _hAcc = 0, _hMax = 0, _hN = 0, _hLast = Date.now();
setInterval(() => {
  const _hStart = performance.now();
  const t = now(); const dt = Math.min(0.1, (t - last) / 1000); last = t;
  if (wizard) wizard.mana = Math.min(WIZARD.maxMana, wizard.mana + WIZARD.manaRegen * dt);
  const combat = phase === 'combat';
  if (combat && t >= phaseEndsAt && king.alive) endRoundToIntermission();
  else if (phase === 'intermission' && t >= phaseEndsAt) startRound(round + 1);
  else if (phase === 'over' && t >= phaseEndsAt) resetGame();   // after game over, auto-return to lobby so the next match can start

  // King / Wizard positions are now CLIENT-AUTHORITATIVE (see 'kpos' / 'wpos' handlers); no server integration.
  for (const tr of trees.values()) if (!tr.alive && t >= tr.regrowAt) { tr.alive = true; tr.hp = TREE.hp; }
  for (const o of irons.values()) if (!o.alive && t >= o.regrowAt) { o.alive = true; o.hp = IRON.hp; }
  if (combat && gateUp() && king.alive && king.hp < king.maxHp) king.hp = Math.min(king.maxHp, king.hp + king.maxHp * KING.regenFrac * dt);   // regen while shielded behind the closed gate
  if (combat && t - lastWaveAt > WAVE.intervalMs / tune.waveRate) { lastWaveAt = t; spawnWave(waveSize()); }

  const up = gateUp();
  // Player movement is now CLIENT-AUTHORITATIVE (see the 'pos' handler). The server no longer
  // integrates mx/mz for players; it only handles respawn and re-clamps if the gate just dropped.
  for (const p of players.values()) {
    if (!p.alive) { if (t >= p.respawnAt) { const [x, z] = playerSpawn(); p.x = x; p.z = z; p.hp = effMaxHp(p); p.alive = true; p.spawnGuard = t + 500; } continue; }   // spawnGuard: ignore the client's stale death position for a moment so respawn sticks at the back
    if (up && p.z < LANE.wallZ + 3.5) p.z = LANE.wallZ + 3.5;   // keep attackers in FRONT of a standing gate
  }

  if (combat) for (const tr of troops.values()) {
    // nearest live attacker (archers shoot this; also a melee candidate)
    let tp = null, pbest = Infinity;
    for (const p of players.values()) { if (!p.alive) continue; const d = (p.x - tr.x) ** 2 + (p.z - tr.z) ** 2; if (d < pbest) { pbest = d; tp = p; } }
    if (tr.kind === 'archer') {
      // ARCHER: hang back and loose arrows at the nearest attacker; advance only to stay in range.
      const dx = tp ? tp.x - tr.x : 0, dz = tp ? tp.z - tr.z : -1, d = Math.hypot(dx, dz) || 1;
      if (tp && d > ARCHER.range) { tr.x += (dx / d) * TROOP.speed * dt; tr.z += (dz / d) * TROOP.speed * dt; const c = clampToLane(tr.x, tr.z); tr.x = c[0]; tr.z = c[1]; }
      else if (tp && t - tr.lastAtk > ARCHER.cd) { tr.lastAtk = t; const aa = Math.atan2(tp.x - tr.x, tp.z - tr.z); projectiles.push({ id: projId++, owner: -2, foe: true, wep: 'enemyarrow', x: tr.x, y: 2, z: tr.z, ox: tr.x, oz: tr.z, range: ARCHER.range + 10, vx: Math.sin(aa) * ARCHER.projSpeed, vz: Math.cos(aa) * ARCHER.projSpeed, vy: 0, arc: false, born: t, splash: 0, dmg: ARCHER.dmg * tune.troopDmg }); fxQueue.push({ k: 'troophit', x: tr.x, z: tr.z }); }
      continue;
    }
    // MELEE: charge the nearest of player / friendly / destructible build (trebuchet) and smash it.
    let tgt = tp, ttype = tp ? 'player' : null, best = pbest;
    for (const f of friendlies.values()) { const d = (f.x - tr.x) ** 2 + (f.z - tr.z) ** 2; if (d < best) { best = d; tgt = f; ttype = 'friendly'; } }
    for (const b of builds.values()) { if (!b.built || !b.destructible) continue; const d = (b.x - tr.x) ** 2 + (b.z - tr.z) ** 2; if (d < best) { best = d; tgt = b; ttype = 'build'; } }
    const tx = tgt ? tgt.x : tr.x, tz = tgt ? tgt.z : LANE.playerSpawnZ;
    const dx = tx - tr.x, dz = tz - tr.z, d = Math.hypot(dx, dz) || 1;
    const reach = ttype === 'build' ? (tgt.r + TROOP.attackRange) : TROOP.attackRange;
    if (d > reach) { tr.x += (dx / d) * TROOP.speed * dt; tr.z += (dz / d) * TROOP.speed * dt; const c = clampToLane(tr.x, tr.z); tr.x = c[0]; tr.z = c[1]; }
    else if (t - tr.lastAtk > TROOP.attackCd) { tr.lastAtk = t;
      if (ttype === 'player') { damagePlayer(tgt, TROOP.dmg * tune.troopDmg); fxQueue.push({ k: 'troophit', x: tgt.x, z: tgt.z }); }
      else if (ttype === 'friendly') { tgt.hp -= TROOP.dmg; if (tgt.hp <= 0) { fxQueue.push({ k: 'troopdie', x: tgt.x, z: tgt.z }); friendlies.delete(tgt.id); } }
      else if (ttype === 'build') { damageBuildStruct(tgt, TROOP.dmg); fxQueue.push({ k: 'troophit', x: tgt.x, z: tgt.z }); }
    }
  }
  // Keep troops from piling onto one tile (a stack reads as a single super-unit that hits all at once).
  if (combat && troops.size > 1) { const TSEP = 1.7, arr = [...troops.values()];
    for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) { const A = arr[a], B = arr[b], sdx = B.x - A.x, sdz = B.z - A.z, sd = sdx * sdx + sdz * sdz; if (sd < TSEP * TSEP && sd > 0.0004) { const dist = Math.sqrt(sd), push = (TSEP - dist) * 0.5, ux = sdx / dist, uz = sdz / dist; A.x -= ux * push; A.z -= uz * push; B.x += ux * push; B.z += uz * push; } }
    for (const tr of arr) { const c = clampToLane(tr.x, tr.z); tr.x = c[0]; tr.z = c[1]; }
  }

  // Friendly troops (from a built troop camp): fight nearby enemies, else march to the gate and chip it.
  if (combat) for (const f of friendlies.values()) {
    let en = null, eb = FRIENDLY.atkRange * FRIENDLY.atkRange; for (const tr of troops.values()) { const d = (tr.x - f.x) ** 2 + (tr.z - f.z) ** 2; if (d < eb) { eb = d; en = tr; } }
    if (en) { if (t - f.lastAtk > FRIENDLY.atkCd) { f.lastAtk = t; en.hp -= 16; if (en.hp <= 0) { fxQueue.push({ k: 'troopdie', x: en.x, z: en.z }); troops.delete(en.id); } } }
    else if (f.z > LANE.wallZ + 3) { const dz = (LANE.wallZ + 2) - f.z, dx = -f.x, d = Math.hypot(dx, dz) || 1; f.x += (dx / d) * FRIENDLY.speed * dt; f.z += (dz / d) * FRIENDLY.speed * dt; }
    else if (t - f.lastAtk > FRIENDLY.atkCd) { f.lastAtk = t; if (gateUp()) damageGate(FRIENDLY.gateDmg); }
  }

  // Built structures: hospital heals nearby attackers; troop camp trickles friendlies (free, capped).
  if (combat) for (const b of builds.values()) {
    if (!b.built) continue;
    if (b.kind === 'hospital') { for (const p of players.values()) { if (!p.alive) continue; if (Math.hypot(p.x - b.x, p.z - b.z) <= b.cfg.healR) { const mh = effMaxHp(p); if (p.hp < mh) p.hp = Math.min(mh, p.hp + b.cfg.healPerSec * dt); } } }
    else if (b.kind === 'troopcamp') { if (friendlies.size < b.cfg.capAlive && t - b.lastSpawn > b.cfg.spawnMs) { b.lastSpawn = t; friendlies.set(friendlyId, { id: friendlyId, x: b.x + (Math.random() - 0.5) * 4, z: b.z, hp: FRIENDLY.hp, lastAtk: 0 }); friendlyId++; } }
    // trebuchet is now PLAYER-fired (stand at it, spend 1 iron) — see playerFire; no auto-fire.
  }

  // CANNON cogs: while a station is being cranked (recent input), sweep that axis and bounce at the limits.
  if (combat && cannon.built) {
    if (t < cannon.tUntil) { cannon.aim += cannon.tDir * CANNON.traverseSpeed * dt; if (cannon.aim >= CANNON.traverseMax) { cannon.aim = CANNON.traverseMax; cannon.tDir = -1; } else if (cannon.aim <= -CANNON.traverseMax) { cannon.aim = -CANNON.traverseMax; cannon.tDir = 1; } }
    if (t < cannon.eUntil) { cannon.range += cannon.eDir * CANNON.rangeSpeed * dt; if (cannon.range >= CANNON.rangeMax) { cannon.range = CANNON.rangeMax; cannon.eDir = -1; } else if (cannon.range <= CANNON.rangeMin) { cannon.range = CANNON.rangeMin; cannon.eDir = 1; } }
  }

  if (combat) for (const tw of towers) {
    if (t - tw.lastShot < TOWER.cd) continue;
    let tp = null, best = TOWER.range * TOWER.range; for (const p of players.values()) { if (!p.alive) continue; const d = (p.x - tw.x) ** 2 + (p.z - tw.z) ** 2; if (d < best) { best = d; tp = p; } }
    if (tp) { tw.lastShot = t; damagePlayer(tp, TOWER.dmg); fxQueue.push({ k: 'arrow', x: tw.x, z: tw.z, tx: tp.x, tz: tp.z }); }
  }

  if (combat && ram.active) {
    let pushers = 0; for (const p of players.values()) if (p.alive && Math.hypot(p.x - ram.x, p.z - ram.z) <= RAM.pushRadius) pushers++;
    if (pushers > 0) ram.z -= Math.min(RAM.maxSpeed, pushers * RAM.perPusherSpeed) * dt; else ram.z = Math.min(RAM.startZ, ram.z + RAM.idleDrift * dt);
    if (ram.z <= RAM.gateZ) { const dmg = Math.round((gate.maxHp || 1000) * 0.5); if (gateUp()) damageGate(dmg); else damageKing(Math.round(king.maxHp * RAM.impactDmgFrac), null); fxQueue.push({ k: 'ramimpact', x: 0, z: RAM.gateZ }); broadcast({ t: 'ev', kind: 'ramhit' }); ram = { built: false, active: false, x: 0, z: RAM.startZ, bw: 0, bi: 0 }; }
  }

  const keep = [];
  for (const pr of projectiles) {
    pr.x += pr.vx * dt; pr.z += pr.vz * dt; if (pr.arc) { pr.y += pr.vy * dt; pr.vy -= 22 * dt; }
    let done = false;
    if (pr.foe) {
      // enemy arrow: damage the nearest attacker it touches
      let hp_ = null, hb2 = Infinity; for (const p of players.values()) { if (!p.alive) continue; const d = (p.x - pr.x) ** 2 + (p.z - pr.z) ** 2; if (d < hb2) { hb2 = d; hp_ = p; } }
      if (hp_ && Math.sqrt(hb2) <= 1.5) { damagePlayer(hp_, pr.dmg); fxQueue.push({ k: 'troophit', x: hp_.x, z: hp_.z }); done = true; }
    } else if (pr.gateOnly) {
      if (up && pr.z <= LANE.wallZ) { damageGate(pr.dmg); done = true; }
    } else {
      let hitT = null, hb = Infinity; if (!pr.landOnly || pr.y < 2.5) for (const tr of troops.values()) { const d = (tr.x - pr.x) ** 2 + (tr.z - pr.z) ** 2; if (d < hb) { hb = d; hitT = tr; } }
      if (hitT && Math.sqrt(hb) <= TROOP.radius + 0.6) { damageTroop(hitT, pr.dmg, pr.owner); done = true; }
      if (!done && !pr.antiUnit && up && pr.z <= LANE.wallZ) { damageGate(pr.dmg); done = true; }
      if (!done && !pr.antiUnit && !up && king.alive && Math.hypot(pr.x - king.x, pr.z - king.z) <= KING.radius) { damageKing(pr.dmg, pr.owner); done = true; }
    }
    if (!done && pr.arc && pr.y <= 0) done = true;
    if (!done && (Math.abs(pr.x) > POCKET.outerX + 8 || pr.z < LANE.minZ - 8 || pr.z > LANE.maxZ + 8 || t - pr.born > 4000 || (pr.range && (pr.x - pr.ox) ** 2 + (pr.z - pr.oz) ** 2 >= pr.range * pr.range))) done = true;
    if (done) {
      if (pr.splash > 0) {
        if (!pr.gateOnly) for (const tr of troops.values()) if (Math.hypot(tr.x - pr.x, tr.z - pr.z) <= pr.splash + TROOP.radius) damageTroop(tr, pr.dmg * 0.6, pr.owner);
        if (!pr.antiUnit && up && pr.z <= LANE.wallZ + pr.splash) damageGate(pr.dmg * 0.5);
        else if (!pr.gateOnly && !pr.antiUnit && !up && king.alive && Math.hypot(pr.x - king.x, pr.z - king.z) <= KING.radius + pr.splash) damageKing(pr.dmg * 0.5, pr.owner);
        fxQueue.push({ k: 'boom', x: pr.x, z: pr.z, r: pr.splash, c: WEAPONS[pr.wep].color });
      }
    } else keep.push(pr);
  }
  projectiles = keep;

  const ps = []; for (const p of players.values()) ps.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.a.toFixed(2), Math.round(p.hp), p.wep, p.alive ? 1 : 0, t < p.slowUntil ? 1 : 0, effMaxHp(p), p.gold, p.carry.w, p.carry.i]);
  const prj = projectiles.map(pr => [pr.id, +pr.x.toFixed(1), +pr.y.toFixed(1), +pr.z.toFixed(1), pr.wep]);
  const trp = []; for (const tr of troops.values()) trp.push([tr.id, +tr.x.toFixed(1), +tr.z.toFixed(1), +(tr.hp / TROOP.hp).toFixed(2)]);
  const trees_ = []; for (const tr of trees.values()) if (tr.alive) trees_.push([tr.id, +tr.x.toFixed(1), +tr.z.toFixed(1)]);
  const iron_ = []; for (const o of irons.values()) if (o.alive) iron_.push([o.id, +o.x.toFixed(1), +o.z.toFixed(1)]);
  broadcast({
    t: 's', phase, round, roundsTotal, result,
    timeLeft: (phase === 'combat' || phase === 'intermission') ? Math.max(0, phaseEndsAt - t) : 0,
    gold, gate: { hp: Math.round(gate.hp), maxHp: Math.round(gate.maxHp), open: king.gateOpen ? 1 : 0 },
    king: { x: +king.x.toFixed(2), z: +king.z.toFixed(2), a: +king.a.toFixed(2), hp: Math.round(king.hp), maxHp: king.maxHp, alive: king.alive ? 1 : 0, vulnerable: (!up && combat) ? 1 : 0, guards: guardCount(), up: king.up },
    wizard: wizard ? { mana: Math.round(wizard.mana), x: +wizard.x.toFixed(2), z: +wizard.z.toFixed(2), a: +wizard.a.toFixed(2) } : null,
    players: ps, proj: prj, troops: trp, trees: trees_, ironNodes: iron_,
    wood: ram.bw, iron: ram.bi, woodNeeded: woodNeeded(), ironNeeded: ironNeeded(),
    ram: ram.active ? { x: +ram.x.toFixed(1), z: +ram.z.toFixed(1) } : null,
    ramSite: { x: +ram.x.toFixed(1), z: +ram.z.toFixed(1), built: ram.built ? 1 : 0, active: ram.active ? 1 : 0, bw: ram.bw, bi: ram.bi, needW: woodNeeded(), needI: ironNeeded() },
    builds: [...builds.values()].map(b => [b.id, b.kind, b.x, b.z, b.built ? 1 : 0, b.bw, b.bi, b.needW, b.needI, Math.round(b.hp), b.maxHp]),
    friendlies: [...friendlies.values()].map(f => [f.id, +f.x.toFixed(1), +f.z.toFixed(1)]),
    cannon: { x: CANNON.x, z: CANNON.z, built: cannon.built ? 1 : 0, bi: cannon.bi, needI: cannon.needI, hp: Math.round(cannon.hp), maxHp: CANNON.hp, aim: +cannon.aim.toFixed(3), range: +cannon.range.toFixed(1) },
    towers: towers.map(tw => [tw.x, tw.z]),
    fx: fxQueue.splice(0, fxQueue.length),
  });
  const _hd = performance.now() - _hStart; _hAcc += _hd; if (_hd > _hMax) _hMax = _hd; _hN++;
  if (Date.now() - _hLast >= 5000) { console.log(`[health] players=${players.size} clients=${clients.size}  tick avg=${(_hAcc / _hN).toFixed(2)}ms max=${_hMax.toFixed(2)}ms  budget=${TICK_MS}ms`); _hAcc = 0; _hMax = 0; _hN = 0; _hLast = Date.now(); }
}, TICK_MS);

server.listen(PORT, () => {
  const ips = []; for (const iface of Object.values(os.networkInterfaces())) for (const a of iface) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  console.log(`\n  HUNT FOR JEREMY is running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network: http://${ip}:${PORT}   <- guests scan/visit this`);
  console.log(`\n  Guests: /   |  King: /king  |  Wizard: /wizard  |  TV: /screen\n`);
});
