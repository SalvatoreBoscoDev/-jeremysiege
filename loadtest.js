// Synthetic load test for Hunt for Jeremy — simulate a swarm of phones hammering the server.
//
// Best run ON the game container (raw server capacity, no tunnel in the way):
//     cd /opt/hunt-for-jeremy && N=50 SECS=30 node loadtest.js
// ...while watching the server's own health log in another shell:
//     journalctl -u hunt-for-jeremy -f      (look for the [health] lines)
//
// Or from your laptop THROUGH the tunnel to test the real-world path:
//     URL=wss://jeremysiege.com N=50 SECS=30 node loadtest.js
//
// Each bot joins as a player, random-walks (sends 'pos' ~18/s) and fires (~3/s),
// exactly like a real phone. It reports how many snapshots/bandwidth the server pushes back.

import WebSocket from 'ws';

const URL  = process.env.URL  || 'ws://localhost:8080';
const N    = +(process.env.N    || 50);   // number of fake players
const SECS = +(process.env.SECS || 30);   // how long to run
const CLASSES = ['blaster', 'shotgun', 'grenade', 'cannon', 'rocket'];

let opened = 0, joined = 0, msgs = 0, bytes = 0, errors = 0;
const bots = [];

function spawnBot(i) {
  let ws;
  try { ws = new WebSocket(URL); } catch { errors++; return; }
  const mode = (i % 4 < 2) ? 'jeremy' : (i % 4 === 2) ? 'mine' : 'random';   // 50% charge Jeremy, 25% to the iron mine, 25% random "whatever"
  const bot = { ws, x: (Math.random() - 0.5) * 30, z: 108 + Math.random() * 14, a: Math.PI, mode,
    dest: mode === 'jeremy' ? { x: (Math.random() - 0.5) * 40, z: -50 }            // straight down the lane to the castle wall
        : mode === 'mine'   ? { x: 30 + Math.random() * 16, z: 95 + Math.random() * 30 }  // the IRON pocket (right side)
        : null };
  bots.push(bot);
  ws.on('open', () => { opened++; ws.send(JSON.stringify({ t: 'join', role: 'player', name: 'bot' + i, class: CLASSES[i % 5] })); });
  ws.on('message', (d) => { msgs++; bytes += (d.length || Buffer.byteLength(d)); try { if (JSON.parse(d).t === 'welcome') joined++; } catch {} });
  ws.on('error', () => { errors++; });
  ws.on('close', () => {});
}

// Movement load: every bot reports a new position ~18x/sec (same cadence as the real client).
const STEP = 18 * 0.055;   // ~player walk speed per 55ms tick — smooth straight-line travel toward the destination
setInterval(() => {
  for (const b of bots) {
    if (b.ws.readyState !== 1) continue;
    if (b.dest) {
      const dx = b.dest.x - b.x, dz = b.dest.z - b.z, d = Math.hypot(dx, dz);
      if (d > 0.6) { b.x += (dx / d) * STEP; b.z += (dz / d) * STEP; b.a = Math.atan2(dx, dz); }   // glide in a straight line
      else { b.x += (Math.random() - 0.5) * 0.4; b.z += (Math.random() - 0.5) * 0.4; }              // arrived: small jiggle (mining / shoving the gate)
    } else {
      b.x += (Math.random() - 0.5) * 5; b.z += (Math.random() - 0.5) * 5; b.a = Math.random() * 6.283;   // the "whatever" quarter: random walk
    }
    b.ws.send(JSON.stringify({ t: 'pos', x: +b.x.toFixed(2), z: +b.z.toFixed(2), a: b.a }));
  }
}, 55);

// Fire load: most bots pull the trigger a few times a second.
setInterval(() => { for (const b of bots) if (b.ws.readyState === 1 && Math.random() < 0.6) b.ws.send(JSON.stringify({ t: 'fire' })); }, 200);

// Ramp connections up gradually so we don't hit the server with a thundering herd.
let made = 0;
const ramp = setInterval(() => { if (made >= N) return clearInterval(ramp); spawnBot(made++); }, 40);

// Report every 2 seconds.
let lb = 0, lm = 0, lt = Date.now();
const rep = setInterval(() => {
  const dt = (Date.now() - lt) / 1000; lt = Date.now();
  const mps  = ((msgs - lm) / dt).toFixed(0);
  const mbit = (((bytes - lb) / dt) * 8 / 1e6).toFixed(2);
  console.log(`conn ${opened}/${N}  joined ${joined}  |  msgs/s ${mps} (~${(mps / Math.max(1, joined)).toFixed(1)}/bot)  |  inbound ${mbit} Mbit/s  |  errors ${errors}`);
  lb = bytes; lm = msgs;
}, 2000);

setTimeout(() => {
  clearInterval(rep);
  console.log(`\n=== done: ${joined}/${N} bots joined, ${(bytes / 1e6).toFixed(1)} MB inbound total over ${SECS}s ===`);
  console.log(`(a healthy run: ~22 msgs/bot/sec, server [health] tick avg well under ${process.env.TICK || 45}ms, errors 0)`);
  for (const b of bots) { try { b.ws.close(); } catch {} }
  setTimeout(() => process.exit(0), 500);
}, SECS * 1000 + 2500);

console.log(`Load test -> ${URL}  :  ${N} bots for ${SECS}s`);
