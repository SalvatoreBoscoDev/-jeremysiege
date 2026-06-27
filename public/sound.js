// Hunt for Jeremy — procedural sound effects via the Web Audio API.
// No audio files: every sound is synthesized on the fly (tiny, instant, works offline).
// Call Sound.init() from a real user gesture (a tap/click) before sounds will play (browser autoplay rule).

let ctx = null, master = null;
let muted = false;
const recent = [];   // timestamps, for the global rate limiter (keeps 50 players from becoming noise)

function ok(max = 9, win = 110) {
  const t = performance.now();
  while (recent.length && t - recent[0] > win) recent.shift();
  if (recent.length >= max) return false;
  recent.push(t);
  return true;
}
function T() { return ctx.currentTime; }
function tone({ f = 440, f2 = null, dur = 0.15, type = 'sine', vol = 0.3, atk = 0.005 } = {}) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = T();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise({ dur = 0.2, vol = 0.35, cut = 1400, type = 'lowpass', q = 1 } = {}) {
  if (!ctx || muted) return;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = cut; f.Q.value = q;
  const g = ctx.createGain(), t = T();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.03);
}
function fanfare(seq, type = 'square', vol = 0.3, dur = 0.32) {
  seq.forEach(([f, d]) => setTimeout(() => tone({ f, dur, type, vol }), d * 1000));
}

export const Sound = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    } catch { ctx = null; }
  },
  ready() { return !!ctx; },
  setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0.0001 : 0.5, ctx.currentTime, 0.02); },
  toggleMute() { this.setMuted(!muted); return muted; },
  isMuted() { return muted; },

  // ---- combat ----
  shoot(wep) {
    if (!ctx || muted || !ok(6, 90)) return;
    if (wep === 'shotgun') noise({ dur: 0.12, vol: 0.22, cut: 2600, type: 'highpass' });
    else if (wep === 'grenade' || wep === 'rocket') tone({ f: 300, f2: 120, dur: 0.18, type: 'sawtooth', vol: 0.2 });
    else if (wep === 'cannon') tone({ f: 520, f2: 300, dur: 0.1, type: 'square', vol: 0.18 });
    else tone({ f: 900, f2: 1500, dur: 0.07, type: 'triangle', vol: 0.16 });   // blaster: quick pew
  },
  hit() { if (ok(8, 80)) tone({ f: 320, f2: 150, dur: 0.06, type: 'square', vol: 0.16 }); },
  explosion(big) {
    if (!ok(6, 120)) return;
    noise({ dur: big ? 0.55 : 0.3, vol: big ? 0.5 : 0.3, cut: big ? 900 : 1500, type: 'lowpass' });
    tone({ f: big ? 120 : 180, f2: 40, dur: big ? 0.5 : 0.26, type: 'sine', vol: big ? 0.4 : 0.24 });
  },
  death() { if (ok(5, 120)) { tone({ f: 420, f2: 80, dur: 0.4, type: 'sawtooth', vol: 0.28 }); noise({ dur: 0.22, vol: 0.16, cut: 1000 }); } },
  ability() { tone({ f: 280, f2: 1200, dur: 0.3, type: 'sawtooth', vol: 0.3 }); tone({ f: 560, f2: 1600, dur: 0.22, type: 'triangle', vol: 0.16 }); },
  kingAttack(kind) {
    if (!ok(4, 160)) return;
    this.explosion(true);
    if (kind === 'summon') fanfare([[180, 0], [240, 0.1]], 'sawtooth', 0.3, 0.3);
    else tone({ f: 150, f2: 55, dur: 0.45, type: 'square', vol: 0.34 });
  },
  laserCharge() { if (!ok(4, 200)) return; tone({ f: 90, f2: 540, dur: 1.0, type: 'sawtooth', vol: 0.26 }); },   // rising whine as the beam spools up
  laserFire() { if (!ok(4, 160)) return; tone({ f: 900, f2: 120, dur: 0.32, type: 'sawtooth', vol: 0.38 }); tone({ f: 1500, f2: 300, dur: 0.18, type: 'square', vol: 0.18 }); noise({ dur: 0.25, vol: 0.22, cut: 2200, type: 'bandpass' }); },
  wave() { if (ok(3, 300)) { tone({ f: 165, f2: 120, dur: 0.5, type: 'sawtooth', vol: 0.22 }); tone({ f: 110, f2: 90, dur: 0.55, type: 'square', vol: 0.18 }); } },

  // ---- gathering / building ----
  chop() { if (ok(6, 80)) { tone({ f: 250, f2: 140, dur: 0.08, type: 'square', vol: 0.18 }); noise({ dur: 0.05, vol: 0.1, cut: 1800, type: 'bandpass' }); } },
  mine() { if (ok(6, 80)) tone({ f: 1500, f2: 950, dur: 0.07, type: 'triangle', vol: 0.15 }); },
  build() { tone({ f: 500, f2: 900, dur: 0.18, type: 'triangle', vol: 0.28 }); tone({ f: 760, f2: 1250, dur: 0.22, type: 'sine', vol: 0.2 }); },
  buy() { tone({ f: 880, f2: 1320, dur: 0.16, type: 'square', vol: 0.26 }); tone({ f: 1320, dur: 0.12, type: 'sine', vol: 0.16 }); },

  // ---- wizard ----
  heal() { tone({ f: 600, f2: 1000, dur: 0.3, type: 'sine', vol: 0.24 }); tone({ f: 900, f2: 1350, dur: 0.34, type: 'sine', vol: 0.16 }); },
  freeze() { tone({ f: 1800, f2: 600, dur: 0.5, type: 'triangle', vol: 0.2 }); noise({ dur: 0.4, vol: 0.1, cut: 4000, type: 'highpass' }); },

  // ---- structure / gate ----
  gateHit() { if (ok(5, 130)) { noise({ dur: 0.18, vol: 0.3, cut: 500 }); tone({ f: 90, f2: 60, dur: 0.2, type: 'square', vol: 0.22 }); } },
  gateBreach() { noise({ dur: 0.7, vol: 0.5, cut: 800 }); tone({ f: 220, f2: 45, dur: 0.7, type: 'sawtooth', vol: 0.42 }); tone({ f: 110, f2: 40, dur: 0.6, type: 'square', vol: 0.3 }); },

  // ---- stingers ----
  round() { fanfare([[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4]], 'square', 0.3, 0.3); },
  intermission() { fanfare([[784, 0], [659, 0.16]], 'sine', 0.24, 0.34); },
  win() { fanfare([[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [1319, 0.66]], 'square', 0.34, 0.42); },
  lose() { fanfare([[440, 0], [349, 0.22], [262, 0.48]], 'sawtooth', 0.3, 0.55); },
};
