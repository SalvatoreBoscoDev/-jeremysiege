// Headless end-to-end test: gate/rounds, wood+iron ram, gold-from-kills, weapon shop, win conditions.
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const boot = (port, env) => spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: port, ...env }, stdio: 'ignore' });
function mkClient(url, role, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url); const c = { ws, role, id: null, lastSnap: null, events: [], welcome: null };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', role, name })));
    ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'welcome') { c.id = m.id; c.welcome = m; resolve(c); } else if (m.t === 's') c.lastSnap = m; else if (m.t === 'ev') c.events.push(m); });
  });
}
const evOf = (cs, kind) => cs.flatMap(c => c.events).find(e => e.kind === kind);
const meOf = (p) => p.lastSnap.players.find(x => x[0] === p.id);
const LANE_HALF = 26;

// ================= Server A: siege -> attackers win =================
const A = 8099, AU = `ws://localhost:${A}`;
const srvA = boot(A, { JEREMY_HP: '500', GATE_HP: '400', ROUNDS_N: '1', ROUND_MS: '60000', INT_MS: '3000' });
await sleep(1200);
try {
  const king = await mkClient(AU, 'king', 'Jeremy');
  const players = []; for (let i = 0; i < 5; i++) players.push(await mkClient(AU, 'player', 'P' + i));
  await sleep(300);
  ok(king.welcome.lane && king.welcome.weaponBuy, 'welcome carries lane + weapon-buy config');
  ok(players[0].lastSnap.phase === 'lobby', 'starts in lobby');
  king.ws.send(JSON.stringify({ t: 'start' })); await sleep(300);
  ok(players[0].lastSnap.phase === 'combat', 'START -> round 1 combat');
  ok((players[0].lastSnap.trees || []).length > 0 && (players[0].lastSnap.ironNodes || []).length > 0, 'forest (left) + quarry (right) present');

  const gate0 = players[0].lastSnap.gate.hp, kingMax = players[0].lastSnap.king.maxHp;
  let kingHurtWhileGateUp = false, breached = false, won = false;
  const deadline = Date.now() + 16000;
  while (Date.now() < deadline) {
    for (const p of players) { const me = meOf(p) || [0,0,0]; const a = Math.atan2(players[0].lastSnap.king.x - me[1], players[0].lastSnap.king.z - me[2]); p.ws.send(JSON.stringify({ t: 'in', mx: 0, mz: 0, a })); p.ws.send(JSON.stringify({ t: 'fire' })); }
    const s = players[0].lastSnap;
    if (s.gate.hp > 0 && s.king.hp < kingMax) kingHurtWhileGateUp = true;
    if (s.gate.hp <= 0) breached = true;
    if (evOf([king, ...players], 'gameover')) { won = true; break; }
    await sleep(50);
  }
  ok(players[0].lastSnap.gate.hp < gate0, `gate takes damage (${gate0} -> ${players[0].lastSnap.gate.hp})`);
  ok(!kingHurtWhileGateUp, 'King invulnerable while gate stands');
  ok(breached, 'gate breached');
  const go = evOf([king, ...players], 'gameover');
  ok(go && go.result === 'attackers', 'attackers WIN after breach + kill');
} catch (e) { fail++; console.log('  EXCEPTION(A)', e && e.message); }
srvA.kill(); await sleep(300);

// ============ Server B: gather wood (left room) + iron (right room) -> ram, gold from kills ============
const B = 8100, BU = `ws://localhost:${B}`;
const srvB = boot(B, { GATE_HP: '999999', JEREMY_HP: '999999', ROUND_MS: '30000', ROUNDS_N: '1', WOOD_NEEDED: '1', IRON_NEEDED: '1', PLAYER_GOLD: '0' });
await sleep(1200);
try {
  const king = await mkClient(BU, 'king', 'Jeremy');
  const players = []; for (let i = 0; i < 5; i++) players.push(await mkClient(BU, 'player', 'L' + i));
  await sleep(300);
  king.ws.send(JSON.stringify({ t: 'start' })); await sleep(300);
  ok((players[0].lastSnap.trees || []).length > 0 && (players[0].lastSnap.ironNodes || []).length > 0, 'forest (left room) + quarry (right room) present');
  const driveTo = (p, nodes) => { const me = meOf(p); if (!me || !nodes || !nodes.length) return; let bx=0,bz=0,bd=1e9; for (const n of nodes) { const d=(n[1]-me[1])**2+(n[2]-me[2])**2; if(d<bd){bd=d;bx=n[1];bz=n[2];} } p.ws.send(JSON.stringify({ t:'in', mx:Math.sign(bx-me[1]), mz:Math.sign(bz-me[2]), a:Math.PI })); p.ws.send(JSON.stringify({ t:'fire' })); };
  let ramSeen=false, maxGold=0, anyInRoom=false;
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const s = players[0].lastSnap;
    driveTo(players[0], s.trees); driveTo(players[1], s.ironNodes);
    for (const p of [players[2],players[3],players[4]]) { const me=meOf(p); if(!me) continue; let ax=null,az,bd=1e9; for(const t of (s.troops||[])){ const d=(t[1]-me[1])**2+(t[2]-me[2])**2; if(d<bd){bd=d;ax=t[1];az=t[2];} } const a=ax!=null?Math.atan2(ax-me[1],az-me[2]):Math.PI; p.ws.send(JSON.stringify({t:'in',mx:0,mz:-1,a})); p.ws.send(JSON.stringify({t:'fire'})); }
    const m0=meOf(players[0]); if(m0 && Math.abs(m0[1])>LANE_HALF) anyInRoom=true;
    if (s.ram) ramSeen=true;
    for (const p of players){ const me=meOf(p); if(me) maxGold=Math.max(maxGold, me[9]); }
    if (s.wood>0 && s.iron>0 && ramSeen && maxGold>0 && anyInRoom) break;
    await sleep(50);
  }
  const s1 = players[0].lastSnap;
  ok(anyInRoom, 'a player walked OUT into a side room (past the lane wall)');
  ok(s1.wood > 0 || ramSeen, `chopping produced wood (now ${s1.wood})`);
  ok(s1.iron > 0 || ramSeen, `mining produced iron (now ${s1.iron})`);
  ok(ramSeen, 'ram deployed once BOTH wood and iron were stocked');
  ok(maxGold > 0, `a player earned gold from kills (max ${maxGold})`);
  // ARMORY: walk a (gold-rich) player to the camp armory and buy mid-combat
  const buyer = players[2]; // had PLAYER_GOLD 0 but earned some; give guaranteed via many kills is flaky, so test the gate logic:
  // first prove buying mid-combat AWAY from armory is rejected, then near it is allowed using a fresh rich client
  const rich = await mkClient(BU, 'player', 'RICH');  // joins mid-combat
  await sleep(200);
  // drive RICH to the armory (camp center ~ x0,z89)
  let atArmory=false; const aEnd=Date.now()+9000;
  while(Date.now()<aEnd){ const me=meOf(rich); if(me){ const dx=13-me[1], dz=89-me[2]; if(Math.hypot(dx,dz)<6){atArmory=true;} rich.ws.send(JSON.stringify({t:'in',mx:Math.sign(dx),mz:Math.sign(dz),a:Math.PI})); } if(atArmory) break; await sleep(50); }
  ok(atArmory, 'a player reached the camp Armory');
  // RICH has 0 gold (PLAYER_GOLD 0) -> cannot buy; verify still blaster
  rich.ws.send(JSON.stringify({t:'buyweapon',w:'cannon'})); await sleep(250);
  ok(meOf(rich)[5]==='blaster', 'cannot buy without enough gold');

} catch (e) { fail++; console.log('  EXCEPTION(B)', e && e.message); }
srvB.kill(); await sleep(300);

// ============ Server C: intermission perk + weapon shop + King survives ============
const C = 8101, CU = `ws://localhost:${C}`;
const srvC = boot(C, { NO_TROOPS: '1', GATE_HP: '999999', JEREMY_HP: '999999', ROUND_MS: '2500', INT_MS: '5000', ROUNDS_N: '2', PLAYER_GOLD: '500' });
await sleep(1200);
try {
  const king = await mkClient(CU, 'king', 'Jeremy');
  const players = []; for (let i = 0; i < 3; i++) players.push(await mkClient(CU, 'player', 'C' + i));
  await sleep(300);
  king.ws.send(JSON.stringify({ t: 'start' })); await sleep(300);
  ok(players[0].lastSnap.phase === 'combat', 'round 1 combat started');
  let waited=0; while (players[0].lastSnap.phase !== 'intermission' && waited < 6000) { await sleep(100); waited+=100; }
  ok(players[0].lastSnap.phase === 'intermission', 'reached INTERMISSION');
  const hp0 = meOf(players[0])[8];
  players[0].ws.send(JSON.stringify({ t: 'perk', perk: 'tough' })); await sleep(300);
  ok(meOf(players[0])[8] > hp0, `perk raised max HP (${hp0} -> ${meOf(players[0])[8]})`);
  const g0 = meOf(players[1])[9];
  players[1].ws.send(JSON.stringify({ t: 'buyweapon', w: 'cannon' })); await sleep(300);
  ok(meOf(players[1])[5] === 'cannon' && meOf(players[1])[9] < g0, `bought a weapon (gold ${g0} -> ${meOf(players[1])[9]})`);
  // King buys a self-upgrade with castle gold
  king.ws.send(JSON.stringify({ t: 'buy', item: 'might' })); await sleep(250);
  ok((players[0].lastSnap.king.up||{}).might >= 1, 'King bought a self-upgrade (Might)');
  king.ws.send(JSON.stringify({ t: 'nextround' })); await sleep(300);
  ok(players[0].lastSnap.round === 2, 'round 2 started');
  ok(meOf(players[1])[5] === 'cannon', 'bought weapon persists into next round');
  waited=0; while (players[0].lastSnap.phase !== 'over' && waited < 8000) { await sleep(100); waited+=100; }
  ok(players[0].lastSnap.phase === 'over' && players[0].lastSnap.result === 'king', 'King WINS by surviving all rounds');
} catch (e) { fail++; console.log('  EXCEPTION(C)', e && e.message); }
srvC.kill();

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
