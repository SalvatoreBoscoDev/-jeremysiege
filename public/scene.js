// Shared 3D world: lane battlefield, castle, King, players, troops, effects.
// Per-frame interpolation keeps the 22Hz feed smooth. Tone mapping + (high-quality)
// shadows + environment props make it feel less flat.
import * as THREE from './vendor/three.module.js';
import { LANE, POCKET, CAMP, HILL, WIZ_TOWER, WEAPONS, WEAPON_ORDER, FOREST, TREE, RAM, GATE, TOWER, CANNON } from './shared.js';
import { Sound } from './sound.js';

export function createWorld(canvas, opts = {}) {
  const labels = opts.labels !== false;
  // Quality can be forced per-page with ?q=low|medium|high (e.g. open /king?q=medium on a weaker PC).
  const urlQ = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('q') : null;
  const quality = urlQ || opts.quality || 'high';
  const realShadows = quality === 'high';        // shadows are the big GPU cost
  const detail = quality !== 'low';              // 'medium' = full detail + nice materials, but NO shadows -> way lighter

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (realShadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const scene = new THREE.Scene();
  scene.background = gradientTexture(['#c4d9ff', '#7d74c4', '#3a2563', '#1a1030', '#100a22']);
  scene.fog = new THREE.Fog(0x2c2450, 118, 270);

  scene.add(new THREE.HemisphereLight(0xd6e4ff, 0x432f5e, 1.0));
  const sun = new THREE.DirectionalLight(0xffeacb, 2.15);
  sun.position.set(46, 95, 64);
  scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, 0);
  if (realShadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera; c.near = 1; c.far = 320; c.left = -100; c.right = 100; c.top = 130; c.bottom = -130;
    sun.shadow.bias = -0.0004;
  }
  const rim = new THREE.DirectionalLight(0x8a6cff, 0.62); rim.position.set(-50, 35, -70); scene.add(rim);
  // cool moon fill from behind to separate silhouettes from the night sky
  const moonFill = new THREE.DirectionalLight(0x9fb6ff, 0.28); moonFill.position.set(-120, 90, -160); scene.add(moonFill);

  const midZ = (LANE.maxZ + LANE.minZ) / 2;
  const laneLen = LANE.maxZ - LANE.minZ + 30;
  const laneW = LANE.halfWidth * 2 + 8;

  // ---- ground ----
  const groundTex = laneTexture(); groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(2, 10);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(laneW, laneLen), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = midZ; ground.receiveShadow = realShadows; scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(320, laneLen + 120), new THREE.MeshStandardMaterial({ color: 0x2a4a2c, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.06, midZ); apron.receiveShadow = realShadows; scene.add(apron);

  // ---- side walls + side rooms (forest left, quarry right) ----
  const wmat = new THREE.MeshStandardMaterial({ color: 0x736e80, roughness: 0.92, flatShading: true });
  for (const side of [-1, 1]) {
    const wx = side * (LANE.halfWidth + 1.5);
    // lane wall in two segments, leaving an opening into the side room
    for (const [z0, z1] of [[LANE.minZ, POCKET.zMin], [POCKET.zMax, LANE.maxZ]]) {
      const len = z1 - z0; const w = new THREE.Mesh(new THREE.BoxGeometry(2, 7, len), wmat); w.position.set(wx, 3.5, (z0 + z1) / 2); w.castShadow = realShadows; w.receiveShadow = realShadows; scene.add(w);
      for (let z = z0; z < z1; z += 6) { const cr = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), wmat); cr.position.set(wx, 7.6, z); cr.castShadow = realShadows; scene.add(cr); }
    }
    // the side room: outer wall + two connecting end walls + floor
    const ox = side * (POCKET.outerX + 1.5);
    const ow = new THREE.Mesh(new THREE.BoxGeometry(2, 7, POCKET.zMax - POCKET.zMin + 2), wmat); ow.position.set(ox, 3.5, (POCKET.zMin + POCKET.zMax) / 2); ow.castShadow = realShadows; scene.add(ow);
    for (const zc of [POCKET.zMin, POCKET.zMax]) { const cw = new THREE.Mesh(new THREE.BoxGeometry(POCKET.outerX - LANE.halfWidth + 2, 7, 2), wmat); cw.position.set(side * ((LANE.halfWidth + POCKET.outerX) / 2), 3.5, zc); cw.castShadow = realShadows; scene.add(cw); }
    const fw = POCKET.outerX - LANE.halfWidth; const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, POCKET.zMax - POCKET.zMin), new THREE.MeshStandardMaterial({ color: side < 0 ? 0x4f3f2a : 0x67676f, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.set(side * (LANE.halfWidth + fw / 2), 0.02, (POCKET.zMin + POCKET.zMax) / 2); floor.receiveShadow = realShadows; scene.add(floor);
    // a sign-banner at the opening
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), bannerMaterial()); ban.position.set(wx, 4.4, (POCKET.zMin + POCKET.zMax) / 2); ban.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(ban);
  }

  // ---- torches ----
  const torchFlames = [];
  for (const tz of [LANE.minZ + 20, LANE.minZ + 55, LANE.minZ + 90, LANE.minZ + 125]) for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffcf66, emissive: 0xff7711, emissiveIntensity: 2.2 }));
    flame.position.set(side * (LANE.halfWidth + 0.4), 5.6, tz); scene.add(flame);
    const glow = new THREE.Sprite(glowMaterial(0xff8822)); glow.scale.set(6, 6, 1); glow.position.copy(flame.position); scene.add(glow);
    let light = null; if (quality !== 'low') { light = new THREE.PointLight(0xff8822, 1.0, 30); light.position.copy(flame.position); scene.add(light); }
    torchFlames.push({ flame, glow, light });
  }

  // ---- castle: an intricate gatehouse straddling the gate ----
  const castle = new THREE.Group(); castle.position.set(0, 0, LANE.wallZ - 1); scene.add(castle);
  const stone = new THREE.MeshStandardMaterial({ color: 0x969aab, roughness: 0.88, flatShading: true });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x6e7088, roughness: 0.96, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a213f, roughness: 0.55, metalness: 0.1, flatShading: true });
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x130f1c, emissive: 0xff7a22, emissiveIntensity: 0.5 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd650, metalness: 0.6, roughness: 0.3, emissive: 0x4a3600, emissiveIntensity: 0.35 });
  // NOTE: nothing spans across the top of the gate (keeps the sightline clear) -- decoration sits to the SIDES only.
  // flanking towers
  for (const sx of [-1, 1]) {
    const tx = sx * 28;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.6, 38, 20), stone); tower.position.set(tx, 19, 0); if (realShadows) tower.castShadow = true; castle.add(tower);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const mer = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 1.7), stone); mer.position.set(tx + Math.cos(a) * 5.9, 39.5, Math.sin(a) * 5.9); castle.add(mer); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 12, 20), roofMat); roof.position.set(tx, 46.5, 0); if (realShadows) roof.castShadow = true; castle.add(roof);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 10), goldMat); ball.position.set(tx, 53.5, 0); castle.add(ball);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7, 6), stoneDark); pole.position.set(tx, 57.5, 0); castle.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), goldMat); flag.position.set(tx + 2.6 * sx, 59, 0); castle.add(flag);
    const br = new THREE.PointLight(0xff7733, 0.9, 32); br.position.set(sx * 13, 8, 6); castle.add(br);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffcf66, emissive: 0xff7711, emissiveIntensity: 2.4 })); flame.position.set(sx * 13, 6.6, 6); castle.add(flame);
    const brGlow = new THREE.Sprite(glowMaterial(0xff8a33)); brGlow.scale.set(6, 6, 1); brGlow.position.set(sx * 13, 6.8, 6); castle.add(brGlow);
    // decorative gold finial ring just under each tower roof
    const trim = new THREE.Mesh(new THREE.TorusGeometry(6.0, 0.28, 8, 24), goldMat); trim.rotation.x = Math.PI / 2; trim.position.set(tx, 40.8, 0); castle.add(trim);
    if (detail) {
      for (const by of [10, 20, 30]) { const tb = new THREE.Mesh(new THREE.CylinderGeometry(5.95, 5.95, 1.1, 20), stoneDark); tb.position.set(tx, by, 0); castle.add(tb); }
      for (const sy of [14, 24, 32]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.7), slitMat); s.position.set(tx, sy, 5.7); castle.add(s); }
    }
  }
  // curtain walls running back along the lane edges toward the courtyard
  for (const sx of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 14), stone); cw.position.set(sx * 27, 6, -10); if (realShadows) cw.castShadow = true; castle.add(cw);
    for (let z = -4; z > -18; z -= 4) { const mer = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), stone); mer.position.set(sx * 27, 12.8, z); castle.add(mer); }
  }
  // ---- richer dressing: buttresses, machicolations, gold bands, hanging banners (all on the towers/walls, gate path stays clear) ----
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x7a1230, roughness: 0.82, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const tx = sx * 28;
    if (detail) for (const a of [0.55, Math.PI - 0.55, Math.PI + 0.55, -0.55]) {   // four corner buttresses climbing each tower
      const but = new THREE.Mesh(new THREE.BoxGeometry(1.5, 32, 1.8), stoneDark); but.position.set(tx + Math.cos(a) * 5.6, 16, Math.sin(a) * 5.6); castle.add(but);
    }
    const mac = new THREE.Mesh(new THREE.CylinderGeometry(6.7, 6.0, 2.4, 20), stoneDark); mac.position.set(tx, 37.2, 0); castle.add(mac);   // overhanging machicolation ring
    const band = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.9, 20), goldMat); band.position.set(tx, 40.3, 0); castle.add(band);  // gold band under the roof
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 13), bannerMat); ban.position.set(tx, 23.5, 6.0); castle.add(ban);               // long hanging banner, lane-facing
    const banRod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.2, 8), goldMat); banRod.rotation.z = Math.PI / 2; banRod.position.set(tx, 30, 6.05); castle.add(banRod);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 3), goldMat); crest.position.set(tx, 24.5, 6.16); crest.rotation.x = Math.PI; castle.add(crest);  // gold crest on the banner
  }
  // ---- stone gargoyle guardians perched atop the curtain walls, flanking the gate (behind it, clear of the lane) ----
  for (const sx of [-1, 1]) {
    const gx = sx * 27;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 3.2), stoneDark); plinth.position.set(gx, 13, -4); castle.add(plinth);
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 8), stone); body.position.set(gx, 16.5, -4); castle.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), stone); head.position.set(gx, 19.4, -4); castle.add(head);
    const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), new THREE.MeshStandardMaterial({ color: 0x130f1c, emissive: 0xff5522, emissiveIntensity: 0.9 })); eyes.position.set(gx, 19.5, -3.2); eyes.scale.set(1, 0.45, 0.5); castle.add(eyes);
  }

  // ---- Jeremy's arena: a flat circular courtyard in the back (level ground — no hill to climb) ----
  const arenaR = HILL.radius;
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(arenaR, arenaR, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x4f8244, roughness: 1 }));
  arena.position.set(0, 0.12, HILL.z); arena.receiveShadow = realShadows; scene.add(arena);
  // a raised stone rim so the fighting circle reads clearly from above
  const arenaRing = new THREE.Mesh(new THREE.TorusGeometry(arenaR, 0.9, 8, 56), new THREE.MeshStandardMaterial({ color: 0x6a6450, roughness: 0.85, flatShading: true }));
  arenaRing.rotation.x = Math.PI / 2; arenaRing.position.set(0, 0.35, HILL.z); if (realShadows) arenaRing.castShadow = true; scene.add(arenaRing);
  // decorative arcane runic ring inlaid on the floor (purely cosmetic)
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(arenaR - 5, arenaR - 3.6, 48), new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  runeRing.rotation.x = -Math.PI / 2; runeRing.position.set(0, 0.3, HILL.z); scene.add(runeRing);

  // ---- Wizard's tower (Marin fires from here) ----
  const wtower = new THREE.Group(); wtower.position.set(WIZ_TOWER.x, 0, WIZ_TOWER.z); scene.add(wtower);
  const wt = new THREE.Mesh(new THREE.CylinderGeometry(6, 7.2, WIZ_TOWER.height, 16), new THREE.MeshStandardMaterial({ color: 0x6b6480, roughness: 0.85 })); wt.position.y = WIZ_TOWER.height / 2; if (realShadows) wt.castShadow = true; wtower.add(wt);
  const wtop = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 2.4, 16), new THREE.MeshStandardMaterial({ color: 0x5a5468, roughness: 0.85 })); wtop.position.y = WIZ_TOWER.height + 0.6; wtower.add(wtop);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const mer = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), wt.material); mer.position.set(Math.cos(a) * 7.2, WIZ_TOWER.height + 2.4, Math.sin(a) * 7.2); wtower.add(mer); }
  const wroof = new THREE.Mesh(new THREE.ConeGeometry(5, 7, 16), new THREE.MeshStandardMaterial({ color: 0x542f7d, roughness: 0.55, metalness: 0.1, flatShading: true })); wroof.position.y = WIZ_TOWER.height + 5; wtower.add(wroof);
  const worb = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 14), new THREE.MeshStandardMaterial({ color: 0x9b5cff, emissive: 0x7a33ff, emissiveIntensity: 2 })); worb.position.y = WIZ_TOWER.height + 10; wtower.add(worb);
  const worbGlow = new THREE.Sprite(glowMaterial(0x9b5cff)); worbGlow.scale.set(8, 8, 1); worbGlow.position.y = WIZ_TOWER.height + 10; wtower.add(worbGlow);
  // (the raised villain terrace is gone now that the back is flat — it was the grey slab that z-fought the ground)
  // a brazier glow by the tower
  const tb = new THREE.PointLight(0x9b5cff, 0.7, 26); tb.position.set(WIZ_TOWER.x / 2, HILL.height + 4, LANE.kingZ - 2); scene.add(tb);
  // ---- the Wizard (Marin) figure, standing on the terrace by the tower ----
  const wiz = new THREE.Group(); wiz.position.set(-14, HILL.height, LANE.kingZ); scene.add(wiz);
  const wrobe = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.5, 12), new THREE.MeshStandardMaterial({ color: 0x4a2a6b, roughness: 0.6 })); wrobe.position.y = 2.25; if (realShadows) wrobe.castShadow = true; wiz.add(wrobe);
  const whead = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe6c39a })); whead.position.y = 4.7; wiz.add(whead);
  const what = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0x6a3bb0, emissive: 0x2a1050, emissiveIntensity: 0.5 })); what.position.y = 6.0; wiz.add(what);
  const wstaff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), new THREE.MeshStandardMaterial({ color: 0x5a3d24 })); wstaff.position.set(1.3, 3, 0); wiz.add(wstaff);
  const wstaffOrb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x3399ff, emissiveIntensity: 2 })); wstaffOrb.position.set(1.3, 6.2, 0); wiz.add(wstaffOrb);
  const wstaffGlow = new THREE.Sprite(glowMaterial(0x66ccff)); wstaffGlow.scale.set(3.5, 3.5, 1); wstaffGlow.position.set(1.3, 6.2, 0); wiz.add(wstaffGlow);


  // ---- castle GATE (the barrier attackers must smash) ----
  const gateGroup = new THREE.Group(); gateGroup.position.set(0, 0, LANE.wallZ); scene.add(gateGroup);
  const gateDoor = new THREE.Mesh(new THREE.BoxGeometry(LANE.halfWidth * 2 - 2, 7.5, 2.6), new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.78, metalness: 0.18, emissive: 0xff3300, emissiveIntensity: 0 }));
  gateDoor.position.y = 3.75; if (realShadows) gateDoor.castShadow = true; gateGroup.add(gateDoor);
  for (const yy of [1.75, 3.75, 5.75]) { const band = new THREE.Mesh(new THREE.BoxGeometry(LANE.halfWidth * 2 - 1, 0.8, 2.8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.4 })); band.position.y = yy; gateGroup.add(band); }
  // rows of iron studs so the gate reads as a heavy, riveted castle door
  const studMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.35 });
  for (const yy of [1.75, 3.75, 5.75]) for (let xx = -22; xx <= 22; xx += 5.5) { const stud = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), studMat); stud.position.set(xx, yy, 1.45); gateGroup.add(stud); }
  let gateFrac = 1, gateOpenVis = false;

  // ---- archer towers (bought in the shop) ----
  const towerMeshes = [];
  function syncTowers(list) {
    while (towerMeshes.length < list.length) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 8, 10), stone); base.position.y = 4; if (realShadows) base.castShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.6, 10), stone); top.position.y = 8.4;
      const archer = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3a6ea0 })); archer.position.y = 9.4;
      g.add(base, top, archer); scene.add(g); towerMeshes.push(g);
    }
    for (let i = 0; i < towerMeshes.length; i++) { const t = list[i]; if (t) { towerMeshes[i].visible = true; towerMeshes[i].position.set(t[0], 0, t[1]); } else towerMeshes[i].visible = false; }
  }

  // ---- buildable structures + friendly troops ----
  const buildMeshes = new Map(); const friendlyMeshes = new Map();
  function ensureBuild(id, kind) {
    let g = buildMeshes.get(id); if (g) return g;
    g = new THREE.Group();
    if (kind === 'trebuchet') {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3f24, roughness: 0.9, transparent: true, opacity: 1 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 5.4), woodMat); base.position.y = 0.55; g.add(base);
      for (const sx of [-1.7, 1.7]) for (const sz of [-2, 2]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 12), woodMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(sx, 0.7, sz); g.add(wheel); }
      for (const sx of [-1.5, 1.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 6.6, 8), woodMat); leg.position.set(sx, 3.6, 0); leg.rotation.z = sx > 0 ? 0.32 : -0.32; g.add(leg); }
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), woodMat); brace.position.set(0, 2.6, 0); g.add(brace);
      const apex = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 4.6), woodMat); apex.position.y = 6.5; g.add(apex);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 8.2), woodMat); arm.position.set(0, 6.0, -1.6); arm.rotation.x = -0.8; g.add(arm);
      const sling = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), woodMat); sling.position.set(0, 8.4, -4.6); g.add(sling);
      const cw = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 1, flatShading: true })); cw.position.set(0, 3.9, 2.4); g.add(cw);
      const glow = new THREE.Sprite(glowMaterial(0xffd23f)); glow.scale.set(7, 7, 1); glow.position.y = 6.8; g.add(glow);
      g.userData = { tentMat: woodMat };
      scene.add(g); buildMeshes.set(id, g); return g;
    }
    const tentCol = kind === 'hospital' ? 0xe6edf2 : 0x355f43;
    const tentMat = new THREE.MeshStandardMaterial({ color: tentCol, roughness: 0.92, transparent: true, opacity: 1 });
    const tent = new THREE.Mesh(new THREE.ConeGeometry(4.6, 5, 4), tentMat); tent.rotation.y = Math.PI / 4; tent.position.y = 2.6; g.add(tent); g.userData = { tentMat };
    const glow = new THREE.Sprite(glowMaterial(kind === 'hospital' ? 0xff5555 : 0x66ff9a)); glow.scale.set(7, 7, 1); glow.position.y = 6.4; g.add(glow);
    if (kind === 'hospital') { const m = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xaa0000, emissiveIntensity: 0.8 }); const a = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.2), m); a.position.set(0, 6.2, 2.4); const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.2), m); b.position.set(0, 6.2, 2.4); g.add(a, b); }
    else { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a })); pole.position.set(0, 4, 0); const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshStandardMaterial({ color: 0x66ff9a, side: THREE.DoubleSide })); flag.position.set(1.7, 6.6, 0); g.add(pole, flag); }
    scene.add(g); buildMeshes.set(id, g); return g;
  }
  function ensureFriendly(id) {
    let g = friendlyMeshes.get(id); if (g) return g;
    g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.7, 8), new THREE.MeshStandardMaterial({ color: 0x4caf50 })); body.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0x66d977 })); head.position.y = 2.5;
    g.add(body, head); g.userData = { tx: 0, tz: 0 }; scene.add(g); friendlyMeshes.set(id, g); return g;
  }

  // ---- gold ore veins ----
  const oreMeshes = new Map();
  const oreRockMat = new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 1, flatShading: true });
  const oreNugMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd6, emissive: 0x223040, emissiveIntensity: 0.3, metalness: 0.85, roughness: 0.4, flatShading: true });
  function ensureOre(id, x, z) {
    let g = oreMeshes.get(id);
    if (!g) { g = new THREE.Group(); const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 0), oreRockMat); rock.position.y = 1; if (realShadows) rock.castShadow = true; const nug = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), oreNugMat); nug.position.set(0.3, 1.7, 0.2); g.add(rock, nug); const gl = new THREE.Sprite(glowMaterial(0xbfd0e0)); gl.scale.set(4, 4, 1); gl.position.y = 1.8; g.add(gl); g.position.set(x, 0, z); scene.add(g); oreMeshes.set(id, g); }
    return g;
  }

  // ---- King (Jeremy) ----
  const king = new THREE.Group(); scene.add(king);
  const kModel = new THREE.Group(); king.add(kModel); // bobs independently of world position
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(7, 11), new THREE.MeshStandardMaterial({ color: 0x58163a, side: THREE.DoubleSide, roughness: 0.65 }));
  cape.position.set(0, 7, -2.4); cape.rotation.x = 0.18; kModel.add(cape);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 20), new THREE.MeshStandardMaterial({ color: 0x40235c, roughness: 0.45, metalness: 0.18 })); robe.position.y = 6; robe.castShadow = realShadows; kModel.add(robe);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 5, 16), new THREE.MeshStandardMaterial({ color: 0x62338a, roughness: 0.45, metalness: 0.12 })); torso.position.y = 11; torso.castShadow = realShadows; kModel.add(torso);
  const sash = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.4, 5.6), new THREE.MeshStandardMaterial({ color: 0xffd650, metalness: 0.7, roughness: 0.28, emissive: 0x3a2a00, emissiveIntensity: 0.25 })); sash.position.y = 10; kModel.add(sash);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 18), new THREE.MeshStandardMaterial({ color: 0xe0b48c })); head.position.y = 15; head.castShadow = realShadows; kModel.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 10), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); beard.position.set(0, 13.4, 1.4); beard.rotation.x = Math.PI; kModel.add(beard);
  const eMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2.5 });
  for (const ex of [-0.9, 0.9]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), eMat); e.position.set(ex, 15.4, 1.9); kModel.add(e); }
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd955, emissive: 0x6a5200, emissiveIntensity: 0.6, metalness: 0.95, roughness: 0.18 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.8, 12), crownMat); crown.position.y = 17.4; kModel.add(crown);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), crownMat); sp.position.set(Math.cos(a) * 2.2, 18.5, Math.sin(a) * 2.2); kModel.add(sp); }
  // scepter
  const scepter = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2a2030, metalness: 0.6, roughness: 0.4 })); scepter.position.set(3.6, 8, 1.5); kModel.add(scepter);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 14), new THREE.MeshStandardMaterial({ color: 0x9b5cff, emissive: 0x7a33ff, emissiveIntensity: 2 })); orb.position.set(3.6, 14.2, 1.5); kModel.add(orb);
  const orbGlow = new THREE.Sprite(glowMaterial(0x9b5cff)); orbGlow.scale.set(5, 5, 1); orbGlow.position.copy(orb.position); kModel.add(orbGlow);
  // shield bubble
  const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(10.5, 22, 16), new THREE.MeshStandardMaterial({ color: 0x66ccff, transparent: true, opacity: 0, emissive: 0x3399ff, emissiveIntensity: 0.7, side: THREE.DoubleSide })); shieldMesh.position.y = 8; king.add(shieldMesh);

  // ---- distant scenery ----
  addMountains(scene, midZ);
  addMoon(scene);
  addProps(scene, realShadows);
  const embers = addEmbers(scene, midZ, laneLen);
  addStars(scene);
  const clouds = addClouds(scene, midZ);
  const flags = [];
  addCamp(scene);
  if (detail) {
    addGrass(scene);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffaa33, emissiveIntensity: 1.4 });
    for (const sx of [-1, 1]) {
      const tx = sx * (LANE.halfWidth - 1);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const mer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.2), stone); mer.position.set(tx + Math.cos(a) * 5.2, 29.5, -3 + Math.sin(a) * 5.2); if (realShadows) mer.castShadow = true; castle.add(mer); }
      for (const wy of [11, 17, 23]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.3), winMat); win.position.set(tx, wy, 2.3); castle.add(win); }
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), bannerMaterial()); ban.position.set(tx, 24, 1.3); castle.add(ban); flags.push({ m: ban, ph: Math.random() * 6 });
    }
    for (const wx of [-6, 6]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), winMat); w.position.set(wx, 13, 4.1); castle.add(w); }
  }

  // ---- battering ram ----
  const ram = new THREE.Group(); ram.visible = false; scene.add(ram);
  const ramWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
  const ramLog = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 10, 12), ramWood); ramLog.rotation.x = Math.PI / 2; ramLog.position.y = 3; ram.add(ramLog);
  const ramHead = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 2, 12), new THREE.MeshStandardMaterial({ color: 0x4a4a52, metalness: 0.7, roughness: 0.4 })); ramHead.rotation.x = Math.PI / 2; ramHead.position.set(0, 3, -5.5); ram.add(ramHead);
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), ramWood); beam.position.set(sx * 2, 3, 2); ram.add(beam);
    const beam2 = beam.clone(); beam2.position.set(sx * 2, 3, -2); ram.add(beam2);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * 2.4, 2, 0); ram.add(wheel);
    if (realShadows) { beam.castShadow = true; wheel.castShadow = true; }
  }
  if (realShadows) { ramLog.castShadow = true; ramHead.castShadow = true; }
  const ramGlow = new THREE.Sprite(glowMaterial(0xffcc66)); ramGlow.scale.set(12, 12, 1); ramGlow.position.y = 3; ramGlow.visible = false; ram.add(ramGlow);
  let ramT = null;

  // ---- the CANNON: circular platform + circling ramp + pivoting barrel + landing marker ----
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6675, roughness: 0.95 });
  const cannonGroup = new THREE.Group(); cannonGroup.position.set(CANNON.x, 0, CANNON.z); scene.add(cannonGroup);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(CANNON.platformR, CANNON.platformR + 0.7, CANNON.platformY, 24), stoneMat); plat.position.y = CANNON.platformY / 2; plat.castShadow = realShadows; plat.receiveShadow = realShadows; cannonGroup.add(plat);
  const platTop = new THREE.Mesh(new THREE.CylinderGeometry(CANNON.platformR - 0.3, CANNON.platformR - 0.3, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 1 })); platTop.position.y = CANNON.platformY + 0.15; cannonGroup.add(platTop);
  // one simple straight ramp up the camp-facing (-x) side
  const _run = 6.5, _rise = CANNON.platformY, _sl = Math.hypot(_run, _rise), _th = Math.atan2(_rise, _run);
  const cannonRamp = new THREE.Mesh(new THREE.BoxGeometry(_sl, 0.5, 3.8), new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 1 })); cannonRamp.position.set(-(CANNON.platformR + _run / 2 - 0.4), _rise / 2, 0); cannonRamp.rotation.z = _th; cannonRamp.receiveShadow = realShadows; cannonGroup.add(cannonRamp);
  for (const sz of [-1.95, 1.95]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(_sl, 0.5, 0.3), stoneMat); rail.position.set(-(CANNON.platformR + _run / 2 - 0.4), _rise / 2 + 0.45, sz); rail.rotation.z = _th; cannonGroup.add(rail); }
  // pivoting barrel assembly on top
  const barrelPivot = new THREE.Group(); barrelPivot.position.y = CANNON.platformY + 1.2; cannonGroup.add(barrelPivot);
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 3.6), new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.8, metalness: 0.2 })); carriage.position.y = -0.45; barrelPivot.add(carriage);
  const mortarMat = new THREE.MeshStandardMaterial({ color: 0x33363f, metalness: 0.72, roughness: 0.34 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 4.4, 20), mortarMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.7, -1.6); barrelPivot.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.18, 0.7, 20), new THREE.MeshStandardMaterial({ color: 0x202229, metalness: 0.7, roughness: 0.42 })); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.7, -3.7); barrelPivot.add(muzzle);
  const breechBall = new THREE.Mesh(new THREE.SphereGeometry(1.42, 16, 12), mortarMat); breechBall.position.set(0, 0.7, 0.8); barrelPivot.add(breechBall);
  for (const bz of [-0.6, -2.0, -3.1]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.32, 20), new THREE.MeshStandardMaterial({ color: 0x6a5a2a, metalness: 0.7, roughness: 0.34 })); band.rotation.x = Math.PI / 2; band.position.set(0, 0.7, bz); barrelPivot.add(band); }
  for (const sx of [-1.7, 1.7]) { const cog = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.16, 8, 16), new THREE.MeshStandardMaterial({ color: 0x8a7a3a, metalness: 0.6, roughness: 0.4 })); cog.position.set(sx, 0.2, 1.4); barrelPivot.add(cog); const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a2a, metalness: 0.6 })); spoke.position.set(sx, 0.2, 1.4); barrelPivot.add(spoke); }
  const cannonGlow = new THREE.Sprite(glowMaterial(0xffaa44)); cannonGlow.scale.set(8, 8, 1); cannonGlow.position.y = CANNON.platformY + 2.5; cannonGroup.add(cannonGlow);
  const cannonMarker = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.6, 22), new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); cannonMarker.rotation.x = -Math.PI / 2; cannonMarker.position.y = 0.12; cannonMarker.visible = false; scene.add(cannonMarker);
  let cannonT = null;

  // ---- gameplay trees (server-driven forest) ----
  const treeMeshes = new Map();
  const trunkG = new THREE.CylinderGeometry(0.7, 0.95, 6, 7), trunkM = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
  const leafG = new THREE.ConeGeometry(3.4, 8, 8), leafM = new THREE.MeshStandardMaterial({ color: 0x2c6b32, roughness: 1 });
  function ensureTree(id, x, z) {
    let g = treeMeshes.get(id);
    if (!g) { g = new THREE.Group(); const tr = new THREE.Mesh(trunkG, trunkM); tr.position.y = 3; const lf = new THREE.Mesh(leafG, leafM); lf.position.y = 8; const lf2 = new THREE.Mesh(leafG, leafM); lf2.position.y = 11; lf2.scale.setScalar(0.7); g.add(tr, lf, lf2); g.position.set(x, 0, z); if (realShadows) { tr.castShadow = true; lf.castShadow = true; } scene.add(g); treeMeshes.set(id, g); }
    return g;
  }

  // ---- weapon pickups ----
  const pickupMeshes = new Map();
  function ensurePickup(id, x, z, wi) {
    let g = pickupMeshes.get(id);
    if (!g) {
      const key = WEAPON_ORDER[wi] || 'shotgun'; const col = (WEAPONS[key] || {}).color || 0xffffff;
      g = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 }));
      box.position.y = 1.4; if (realShadows) box.castShadow = true; g.add(box);
      const gl = new THREE.Sprite(glowMaterial(col)); gl.scale.set(5, 5, 1); gl.position.y = 1.4; g.add(gl);
      g.position.set(x, 0, z); scene.add(g); pickupMeshes.set(id, g);
    } else { g.position.x = x; g.position.z = z; }
    return g;
  }

  // ---- dynamic pools ----
  const playerMeshes = new Map(); const projMeshes = new Map(); const fxList = [];
  let roster = new Map();
  let localId = null;   // the local player's id; its mesh is driven by client prediction, not server snapshots
  let localKing = false, localWizard = false;   // when this client controls the King/Wizard, drive it from prediction
  let kingT = { x: 0, z: LANE.kingZ, a: 0, vuln: 1, alive: 1 };
  let wizT = { x: -14, z: LANE.kingZ, a: 0, has: 0 };

  const bodyGeo = new THREE.CapsuleGeometry(0.85, 1.5, 4, 8);
  const fragGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
  const crateGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const headGeo = new THREE.SphereGeometry(0.7, 10, 10);
  const helmGeo = new THREE.CylinderGeometry(0.78, 0.82, 0.5, 8);
  const gunGeo = new THREE.BoxGeometry(0.35, 0.35, 1.9);
  const shadowGeo = new THREE.CircleGeometry(1.1, 14);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });

  // troops (instanced body + head)
  const MAX_TROOPS = 70;
  const tBodyGeo = new THREE.CapsuleGeometry(0.7, 1.0, 3, 6);
  const tBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x2a0000, emissiveIntensity: 0.4 });
  const tHeadGeo = new THREE.SphereGeometry(0.55, 8, 8);
  const tHeadMat = new THREE.MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.7 });
  const troopBody = new THREE.InstancedMesh(tBodyGeo, tBodyMat, MAX_TROOPS); troopBody.count = 0; troopBody.frustumCulled = false; troopBody.castShadow = false;   // skip shadow casting (perf)
  troopBody.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TROOPS * 3), 3); scene.add(troopBody);
  const troopHead = new THREE.InstancedMesh(tHeadGeo, tHeadMat, MAX_TROOPS); troopHead.count = 0; troopHead.frustumCulled = false; scene.add(troopHead);
  const tHelmGeo = new THREE.ConeGeometry(0.62, 0.7, 8); const tHelmMat = new THREE.MeshStandardMaterial({ color: 0x3a3b46, metalness: 0.72, roughness: 0.34 });
  const troopHelm = new THREE.InstancedMesh(tHelmGeo, tHelmMat, MAX_TROOPS); troopHelm.count = 0; troopHelm.frustumCulled = false; troopHelm.castShadow = false; scene.add(troopHelm);
  const troopShadow = realShadows ? null : new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_TROOPS);
  if (troopShadow) { troopShadow.count = 0; troopShadow.frustumCulled = false; scene.add(troopShadow); }
  const troopState = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  const _shadowQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const _col = new THREE.Color();

  function buildCosMeshes(cos) {
    const out = []; const C = cos || {};
    if (C.hat && C.hat !== 'none') {
      if (C.hat === 'tophat') { const gg = new THREE.Group(); const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })); brim.position.y = 3.95; const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 14), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })); top.position.y = 4.7; gg.add(brim, top); out.push(gg); }
      else if (C.hat === 'wizard') { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.1, 14), new THREE.MeshStandardMaterial({ color: 0x4a2a8a, emissive: 0x1a0a3a, emissiveIntensity: 0.4, roughness: 0.6 })); cone.position.y = 4.8; out.push(cone); }
      else if (C.hat === 'horns') { const m = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 }); for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), m); h.position.set(sx * 0.72, 4.3, 0); h.rotation.z = sx * -0.55; out.push(h); } }
      else if (C.hat === 'crown') { const m = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.25, emissive: 0x4a3800, emissiveIntensity: 0.4 }); const gg = new THREE.Group(); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 12), m); band.position.y = 4.0; gg.add(band); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 6), m); sp.position.set(Math.cos(a) * 0.82, 4.5, Math.sin(a) * 0.82); gg.add(sp); } out.push(gg); }
    }
    if (C.cape && C.cape !== 'none') { const col = { red: 0xb01030, blue: 0x2244aa, gold: 0xffcf3a }[C.cape] || 0x888888; const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.7), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 })); cape.position.set(0, 1.85, -0.62); cape.rotation.x = 0.14; out.push(cape); }
    if (C.helmet && C.helmet !== 'none') {
      if (C.helmet === 'knight') { const gg = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xc2c6ce, metalness: 0.75, roughness: 0.33 }); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.84, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m); dome.position.y = 3.15; const visor = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.46, 0.32), m); visor.position.set(0, 3.02, 0.66); gg.add(dome, visor); out.push(gg); }
      else if (C.helmet === 'viking') { const gg = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.6, roughness: 0.4 }); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.84, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), m); dome.position.y = 3.2; gg.add(dome); const hm = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 }); for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.95, 7), hm); h.position.set(sx * 0.86, 3.45, 0); h.rotation.z = sx * -0.95; gg.add(h); } out.push(gg); }
    }
    return out;
  }
  function applyCos(rec, cos) {
    if (!rec || !rec.cosGrp) return;
    while (rec.cosGrp.children.length) rec.cosGrp.remove(rec.cosGrp.children[0]);
    const helmetOn = cos && cos.helmet && cos.helmet !== 'none';
    if (rec.helm) rec.helm.visible = !helmetOn;
    for (const mm of buildCosMeshes(cos)) rec.cosGrp.add(mm);
  }
  function ensurePlayer(id) {
    if (playerMeshes.has(id)) return playerMeshes.get(id);
    const info = roster.get(id) || { name: '...', color: 0xffffff };
    const g = new THREE.Group();
    const vis = new THREE.Group(); g.add(vis);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.5 })); body.position.y = 1.6; body.castShadow = realShadows; vis.add(body);
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.12, 1.5, 12), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.62 })); skirt.position.y = 1.0; skirt.castShadow = realShadows; vis.add(skirt);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x42301c, roughness: 0.65, metalness: 0.25 })); belt.position.y = 1.5; vis.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.12), new THREE.MeshStandardMaterial({ color: 0xffd650, metalness: 0.7, roughness: 0.25, emissive: 0x2a2000, emissiveIntensity: 0.3 })); buckle.position.set(0, 1.5, 0.92); vis.add(buckle);
    const hd = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xe6c39a })); hd.position.y = 3.0; hd.castShadow = realShadows; vis.add(hd);
    const helm = new THREE.Mesh(helmGeo, new THREE.MeshStandardMaterial({ color: info.color, metalness: 0.5, roughness: 0.35 })); helm.position.y = 3.55; vis.add(helm);
    const cosGrp = new THREE.Group(); vis.add(cosGrp);
    if (detail) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.6 })); tab.position.set(0, 1.7, 0.82); vis.add(tab);
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 6, 12, Math.PI * 1.25), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 })); bow.position.set(0.7, 1.9, 0.6); bow.rotation.y = Math.PI / 2; vis.add(bow);
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.18, 12), new THREE.MeshStandardMaterial({ color: info.color, metalness: 0.4, roughness: 0.5 })); shield.rotation.x = Math.PI / 2; shield.position.set(-0.55, 1.8, -0.7); vis.add(shield);
    } else {
      const gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.7 })); gun.position.set(0.55, 1.9, 0.8); vis.add(gun);
    }
    if (!realShadows) { const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh); }
    let label = null; if (labels) { label = makeLabel(info.name, info.color); g.add(label); }
    let hpbar = null; if (labels) { hpbar = makeHpBar(); hpbar.spr.position.y = 5.0; g.add(hpbar.spr); }
    scene.add(g);
    const rec = { g, vis, body, helm, cosGrp, tx: 0, tz: 0, ta: 0, label, hpbar, hpFrac: -1, flung: false, dead: false, tilt: 0, bob: Math.random() * 6 }; applyCos(rec, info.cos); playerMeshes.set(id, rec); return rec;
  }
  function setRoster(list) {
    roster = new Map(list.map(([id, name, color, cos]) => [id, { name, color, cos }]));
    for (const [id, rec] of playerMeshes) { const info = roster.get(id); if (info) { rec.body.material.color.setHex(info.color); applyCos(rec, info.cos); } }
  }

  const _up = new THREE.Vector3(0, 1, 0), _tmpDir = new THREE.Vector3();
  const projDefs = {
    blaster: { geo: new THREE.CylinderGeometry(0.1, 0.1, 1.9, 6), mat: new THREE.MeshStandardMaterial({ color: 0xb89055, roughness: 0.7 }), lie: true },
    shotgun: { geo: new THREE.BoxGeometry(0.55, 0.55, 0.2), mat: new THREE.MeshStandardMaterial({ color: 0xc2c6ce, metalness: 0.7, roughness: 0.35 }) },
    grenade: { geo: new THREE.SphereGeometry(0.55, 8, 8), mat: new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: 0xff5a1a, emissiveIntensity: 1.3 }) },
    cannon:  { geo: new THREE.CylinderGeometry(0.14, 0.14, 1.7, 6), mat: new THREE.MeshStandardMaterial({ color: 0x9aa6b4, metalness: 0.6, roughness: 0.4 }), lie: true },
    rocket:  { geo: new THREE.SphereGeometry(0.95, 8, 8), mat: new THREE.MeshStandardMaterial({ color: 0x8a7866, roughness: 1, flatShading: true }) },
    enemyarrow: { geo: new THREE.CylinderGeometry(0.12, 0.12, 1.7, 6), mat: new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x661111, emissiveIntensity: 0.6, roughness: 0.6 }), lie: true },
  };

  function applySnapshot(s) {
    if (!localKing) { kingT.x = s.king.x; kingT.z = s.king.z; kingT.a = s.king.a; } kingT.vuln = s.king.vulnerable; kingT.alive = s.king.alive;
    if (s.wizard && typeof s.wizard.x === 'number') { if (!localWizard) { wizT.x = s.wizard.x; wizT.z = s.wizard.z; wizT.a = s.wizard.a; } wizT.has = 1; }
    const seen = new Set();
    for (const pp of s.players) {
      const [id, x, z, a, hpFrac, wep, alive, slowed, general] = pp; seen.add(id);
      const rec = ensurePlayer(id); rec.isGeneral = !!general;
      if (rec.g.position.lengthSq() === 0) rec.g.position.set(x, 0, z);
      // Local player is positioned by client prediction (setLocalPos); don't let server snapshots yank it.
      if (id !== localId) { rec.tx = x; rec.tz = z; rec.ta = a; }
      rec.g.visible = true; rec.dead = !alive;
      rec.body.material.emissive.setHex(slowed ? 0x2244ff : 0x000000); rec.body.material.emissiveIntensity = slowed ? 0.7 : 0;
      const isLocal = (id === localId);   // don't float your own name/HP in your face
      if (rec.label) rec.label.visible = !isLocal && !!alive;
      if (rec.hpbar) { const frac = Math.max(0, Math.min(1, (hpFrac || 0) / 100)); if (Math.abs(frac - rec.hpFrac) > 0.01) { rec.hpFrac = frac; rec.hpbar.set(frac); } rec.hpbar.spr.visible = !isLocal && !!alive; }
    }
    for (const [id, rec] of playerMeshes) if (!seen.has(id)) { scene.remove(rec.g); playerMeshes.delete(id); }
    const seenT = new Set();
    for (const tt of s.troops || []) { const [id, x, z] = tt; seenT.add(id);
      let st = troopState.get(id); if (!st) { st = { x, z, tx: x, tz: z, c: 0.85 + Math.random() * 0.3, sc: 0.9 + Math.random() * 0.35 }; troopState.set(id, st); } st.tx = x; st.tz = z; }
    for (const id of troopState.keys()) if (!seenT.has(id)) troopState.delete(id);
    const seenP = new Set();
    for (const pr of s.proj) { const [id, x, y, z, wep] = pr; seenP.add(id);
      let rec = projMeshes.get(id);
      if (!rec) { const d = projDefs[wep] || projDefs.blaster; const m = new THREE.Mesh(d.geo, d.mat); m.position.set(x, y, z); if (d.lie) m.rotation.x = Math.PI / 2; scene.add(m); rec = { m, lx: x, ly: y, lz: z, orient: !!d.lie }; projMeshes.set(id, rec); }
      else { const m = rec.m; const dx = x - rec.lx, dy = y - rec.ly, dz = z - rec.lz; const len = Math.hypot(dx, dy, dz); if (rec.orient && len > 0.0005) m.quaternion.setFromUnitVectors(_up, _tmpDir.set(dx / len, dy / len, dz / len)); m.position.set(x, y, z); rec.lx = x; rec.ly = y; rec.lz = z; }
    }
    for (const [id, rec] of projMeshes) if (!seenP.has(id)) { scene.remove(rec.m); projMeshes.delete(id); }
    if (s.trees) { const seenTr = new Set(); for (const tt of s.trees) { const [id, x, z] = tt; seenTr.add(id); ensureTree(id, x, z); } for (const [id, g] of treeMeshes) if (!seenTr.has(id)) { scene.remove(g); treeMeshes.delete(id); } }
    if (s.ironNodes) { const seenOre = new Set(); for (const oo of s.ironNodes) { const [id, x, z] = oo; seenOre.add(id); ensureOre(id, x, z); } for (const [id, g] of oreMeshes) if (!seenOre.has(id)) { scene.remove(g); oreMeshes.delete(id); } }
    // builds: rise out of the ground as they're built, sink when destroyed
    for (const bb of s.builds || []) { const [id, kind, x, z, built, bw, bi, needW, needI] = bb; const g = ensureBuild(id, kind); g.position.set(x, 0, z); const prog = built ? 1 : Math.min(1, ((bw / Math.max(1, needW)) + (bi / Math.max(1, needI))) / 2); if (g.userData.tentMat) g.userData.tentMat.opacity = 0.32 + 0.68 * prog; }
    // friendly troops: lazy meshes, lerped toward their server position in update()
    const seenF = new Set();
    for (const ff of s.friendlies || []) { const [id, x, z] = ff; seenF.add(id); const g = ensureFriendly(id); if (g.position.lengthSq() === 0) g.position.set(x, 0, z); g.userData.tx = x; g.userData.tz = z; }
    for (const [id, g] of friendlyMeshes) if (!seenF.has(id)) { scene.remove(g); friendlyMeshes.delete(id); }
    gateFrac = (s.gate && s.gate.maxHp) ? s.gate.hp / s.gate.maxHp : 0; gateOpenVis = !!(s.gate && s.gate.open);
    syncTowers(s.towers || []);
    if (s.ramSite) { if (ramT === null) ram.position.set(s.ramSite.x, 0, s.ramSite.z); ramT = s.ramSite; ram.visible = true; } else { ram.visible = false; ramT = null; }
    cannonT = s.cannon || null;
    if (s.fx) for (const f of s.fx) spawnFx(f);
  }

  function update(dt) {
    const k = 1 - Math.exp(-9 * dt);   // gentler smoothing rides out bursty snapshot delivery instead of stepping+snapping
    king.position.x += (kingT.x - king.position.x) * k;
    king.position.z += (kingT.z - king.position.z) * k;
    king.rotation.y += angDiff(kingT.a, king.rotation.y) * k;
    king.position.y = terrainY(king.position.x, king.position.z); // follow the ground: hill, ramp down, or lane when he sallies out
    king.visible = !!kingT.alive;
    // Wizard walks the hilltop too
    wiz.position.x += (wizT.x - wiz.position.x) * k;
    wiz.position.z += (wizT.z - wiz.position.z) * k;
    wiz.position.y = HILL.height;
    if (wizT.has) wiz.rotation.y += angDiff(wizT.a, wiz.rotation.y) * k;
    kModel.position.y = Math.sin(performance.now() / 700) * 0.4; // idle bob
    cape.rotation.x = 0.18 + Math.sin(performance.now() / 900) * 0.06;
    const so = kingT.vuln ? 0 : 0.4; // shimmer means 'protected behind the gate'
    shieldMesh.material.opacity += (so - shieldMesh.material.opacity) * k; shieldMesh.scale.setScalar(1.1);
    if (ramT && ram.visible) { ram.position.x += (ramT.x - ram.position.x) * k; ram.position.z += (ramT.z - ram.position.z) * k;
      if (ramT.active) { ram.position.y = 0; ramGlow.visible = true; ramGlow.material.opacity = 0.4 + Math.sin(performance.now() / 200) * 0.2; }
      else { const prog = Math.min(1, ((ramT.bw / Math.max(1, ramT.needW)) + (ramT.bi / Math.max(1, ramT.needI))) / 2); ram.position.y = -4.5 + prog * 4.5; ramGlow.visible = false; } }
    if (cannonT) {
      const built = cannonT.built;
      barrelPivot.visible = !!built;
      if (built) {
        barrelPivot.rotation.y += (cannonT.aim - barrelPivot.rotation.y) * k;
        const pitch = -1.15 + ((cannonT.range - CANNON.rangeMin) / (CANNON.rangeMax - CANNON.rangeMin)) * 0.5;  // MORTAR: steep up; longer range -> a touch flatter
        barrelPivot.rotation.x += (pitch - barrelPivot.rotation.x) * k;
        const tx = CANNON.x + Math.sin(cannonT.aim) * cannonT.range, tz = CANNON.z - Math.cos(cannonT.aim) * cannonT.range;
        cannonMarker.position.set(Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, tx)), 0.12, Math.max(LANE.minZ, tz)); cannonMarker.visible = true;
        cannonGlow.material.opacity = 0.5;
      } else { cannonMarker.visible = false; const prog = Math.min(1, (cannonT.bi || 0) / Math.max(1, cannonT.needI)); cannonGlow.material.opacity = 0.3 + prog * 0.4; }
    }
    gateGroup.visible = gateFrac > 0.001;
    const gd = 1 - gateFrac; gateDoor.material.emissiveIntensity = gd * 0.9;
    gateGroup.position.x = gateFrac > 0 && gateFrac < 1 ? Math.sin(performance.now() / 45) * gd * 0.4 : 0;
    gateGroup.position.y = gateOpenVis ? -9 : -(1 - gateFrac) * 2;
    for (const rec of playerMeshes.values()) {
      rec.g.position.x += (rec.tx - rec.g.position.x) * k;
      rec.g.position.z += (rec.tz - rec.g.position.z) * k;
      rec.g.rotation.y += angDiff(rec.ta, rec.g.rotation.y) * k;
      const moving = (Math.abs(rec.tx - rec.g.position.x) + Math.abs(rec.tz - rec.g.position.z)) > 0.04;
      rec.bob += dt * 12; if (rec.vis) rec.vis.position.y = moving ? Math.abs(Math.sin(rec.bob)) * 0.32 : rec.vis.position.y * 0.85;
      const tt = rec.dead ? 1 : 0; rec.tilt += (tt - rec.tilt) * (1 - Math.exp(-11 * dt));
      rec.g.rotation.x = rec.tilt * 1.45;          // topple forward when dead
      let liftTarget = 0;
      if (cannonT && cannonT.built) { const rx = rec.g.position.x - CANNON.x, rz = rec.g.position.z - CANNON.z;
        if (rx * rx + rz * rz <= (CANNON.platformR - 0.5) ** 2) liftTarget = CANNON.platformY;                                   // on the platform
        else if (rx <= -(CANNON.platformR - 0.5) && rx >= -(CANNON.platformR + 6.5) && Math.abs(rz) <= 2.3) liftTarget = Math.max(0, Math.min(1, (rx + CANNON.platformR + 6.5) / 6.5)) * CANNON.platformY; } // walking up the ramp
      rec.liftY = (rec.liftY || 0) + (liftTarget - (rec.liftY || 0)) * (1 - Math.exp(-12 * dt));
      rec.g.position.y = Math.max(rec.liftY || 0, terrainY(rec.g.position.x, rec.g.position.z)) - rec.tilt * 0.35;   // cannon platform OR the hill ramp, else ground (sink when dead)
      if (rec.isGeneral && !rec.crown) { rec.crown = makeCrown(); rec.g.add(rec.crown); }
      if (rec.crown) rec.crown.visible = !!rec.isGeneral && !rec.dead;
      if (!rec.dead) rec.flung = false;
      if (rec.vis) rec.vis.visible = !(rec.dead && rec.flung);
    }
    for (const g of friendlyMeshes.values()) { g.position.x += (g.userData.tx - g.position.x) * k; g.position.z += (g.userData.tz - g.position.z) * k; }
    let i = 0;
    for (const st of troopState.values()) {
      if (i >= MAX_TROOPS) break;
      st.x += (st.tx - st.x) * k; st.z += (st.tz - st.z) * k;
      const sc = st.sc || 1; _s.set(sc, sc, sc);
      const wob = Math.sin(performance.now() / 220 + i) * 0.12;
      _p.set(st.x, (1.25 + wob) * sc, st.z); _m.compose(_p, _q, _s); troopBody.setMatrixAt(i, _m);
      _p.set(st.x, (2.35 + wob) * sc, st.z); _m.compose(_p, _q, _s); troopHead.setMatrixAt(i, _m);
      _p.set(st.x, (3.0 + wob) * sc, st.z); _m.compose(_p, _q, _s); troopHelm.setMatrixAt(i, _m);
      _col.setRGB(st.c, st.c * 0.28, st.c * 0.22); troopBody.setColorAt(i, _col);
      if (troopShadow) { _p.set(st.x, 0.04, st.z); _m.compose(_p, _shadowQuat, _s); troopShadow.setMatrixAt(i, _m); }
      i++;
    }
    troopBody.count = i; troopHead.count = i; troopHelm.count = i;
    troopBody.instanceMatrix.needsUpdate = true; troopHead.instanceMatrix.needsUpdate = true; troopHelm.instanceMatrix.needsUpdate = true;
    if (troopBody.instanceColor) troopBody.instanceColor.needsUpdate = true;
    if (troopShadow) { troopShadow.count = i; troopShadow.instanceMatrix.needsUpdate = true; }
    const fl = 0.8 + Math.random() * 0.5;
    for (const t of torchFlames) { const e = 1.8 + Math.random() * 0.9; t.flame.material.emissiveIntensity = e; t.glow.material.opacity = 0.5 + Math.random() * 0.25; if (t.light) t.light.intensity = fl; }
    // embers drift
    const pos = embers.geometry.attributes.position; const arr = pos.array;
    for (let e = 1; e < arr.length; e += 3) { arr[e] += dt * 3; if (arr[e] > 40) arr[e] = 0; } pos.needsUpdate = true;
    for (const c of clouds) { c.position.x += dt * c.userData.spd; if (c.position.x > 240) c.position.x = -240; }
    for (const f of flags) { const t2 = performance.now() / 600 + f.ph; f.m.rotation.y = Math.sin(t2) * 0.28; f.m.scale.x = 1 + Math.sin(t2 * 2) * 0.06; }
    updateFx(dt);
  }

  function explode(x, z, big) {
    const n = big ? 14 : 6; const colors = [0xff4030, 0xff8a30, 0xffd24a, 0xfff0a0];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(fragGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 1 }));
      m.position.set(x, big ? 1.8 : 1.2, z); if (!big) m.scale.setScalar(0.7);
      const ang = Math.random() * Math.PI * 2, sp = (big ? 8 : 5) + Math.random() * (big ? 11 : 5);
      const vel = new THREE.Vector3(Math.cos(ang) * sp, (big ? 9 : 6) + Math.random() * 8, Math.sin(ang) * sp);
      scene.add(m); fxList.push({ m, life: 0, max: big ? 0.95 : 0.6, kind: 'frag', vel, spin: (Math.random() - 0.5) * 22 });
    }
    const fl = new THREE.Sprite(glowMaterial(0xffd9a0)); const fb = big ? 16 : 8; fl.scale.set(fb, fb, 1); fl.position.set(x, big ? 2.2 : 1.4, z); scene.add(fl); fxList.push({ m: fl, life: 0, max: big ? 0.35 : 0.22, kind: 'flash', base: fb });
    const rg = new THREE.Mesh(new THREE.RingGeometry(0.1, big ? 9 : 4, 28), new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); rg.rotation.x = -Math.PI / 2; rg.position.set(x, 0.3, z); scene.add(rg); fxList.push({ m: rg, life: 0, max: big ? 0.6 : 0.4, kind: 'ring' });
    if (big) { const sm = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.5 })); sm.position.set(x, 2.2, z); scene.add(sm); fxList.push({ m: sm, life: 0, max: 1.1, kind: 'puff' }); }
  }
  function spawnFx(f) {
    switch (f.k) {   // procedural SFX for everyone (rate-limited inside Sound so 50 players don't become noise)
      case 'boom': Sound.explosion(false); break;
      case 'death': Sound.death(); break;
      case 'troopdie': case 'troophit': case 'ramhitback': Sound.hit(); break;
      case 'kingatk': Sound.kingAttack(f.kind); break;
      case 'laseraim': Sound.laserCharge(); break;
      case 'laserbeam': Sound.laserFire(); break;
      case 'meteor': Sound.explosion(true); break;
      case 'freeze': Sound.freeze(); break;
      case 'rally': case 'wave': Sound.wave(); break;
      case 'heal': Sound.heal(); break;
      case 'chop': case 'treefell': Sound.chop(); break;
      case 'mine': case 'minegold': Sound.mine(); break;
      case 'ramimpact': Sound.explosion(true); break;
    }
    if (['boom', 'wave'].includes(f.k)) {
      const cmap = { boom: f.c || 0xffaa33, kingatk: 0xff5500, meteor: 0xff3300, freeze: 0x55ccff, rally: 0xff66aa, wave: 0xff3344 };
      const r = f.r || (f.k === 'wave' ? 12 : 6);
      const m = new THREE.Mesh(new THREE.RingGeometry(0.1, r, 28), new THREE.MeshBasicMaterial({ color: cmap[f.k], transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.6, kind: 'ring' });
      const g = new THREE.Sprite(glowMaterial(cmap[f.k])); g.scale.set(r, r, 1); g.position.set(f.x, 1.5, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.4, kind: 'glow' });
      if (f.k === 'meteor') { const b = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 12), new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 2 })); b.position.set(f.x, 40, f.z); scene.add(b); fxList.push({ m: b, life: 0, max: 0.5, kind: 'meteor' }); }
    } else if (f.k === 'kingatk') {
      // DRAMATIC royal attack: twin shockwaves, dome flash, energy pillar, flung embers
      const palette = { slam: 0xff6a1a, laser: 0xff2a55, cannon: 0xff2a2a, summon: 0xffcf3a };
      const col = palette[f.kind] || 0xff8800; const R = f.r || 10;
      for (const rr of [R * 1.7, R * 2.6]) { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, rr, 44), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.8, kind: 'ring' }); }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.95, 20, 14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 })); dome.position.set(f.x, 1, f.z); scene.add(dome); fxList.push({ m: dome, life: 0, max: 0.5, kind: 'puff' });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.4, R * 0.6, 70, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); pillar.position.set(f.x, 35, f.z); scene.add(pillar); fxList.push({ m: pillar, life: 0, max: 0.65, kind: 'pillar' });
      const g = new THREE.Sprite(glowMaterial(col)); g.scale.set(R * 3.2, R * 3.2, 1); g.position.set(f.x, 5, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.55, kind: 'flash', base: R * 3.2 });
      for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(fragGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 })); m.position.set(f.x, 1.5, f.z); const ang = Math.random() * Math.PI * 2, sp = 12 + Math.random() * 26; const vel = new THREE.Vector3(Math.cos(ang) * sp, 14 + Math.random() * 24, Math.sin(ang) * sp); scene.add(m); fxList.push({ m, life: 0, max: 1.0 + Math.random() * 0.4, kind: 'frag', vel, spin: (Math.random() - 0.5) * 24 }); }
    } else if (f.k === 'laseraim') {
      // Telegraph: a flashing ground strip the King is about to vaporize. depthTest off + renderOrder so it shows through the castle WALL (players stand on the far side of it).
      const cx = f.x + f.dx * f.len / 2, cz = f.z + f.dz * f.len / 2, rotY = Math.atan2(-f.dz, f.dx), max = (f.delay || 1050) / 1000;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(f.len, 0.2, f.w * 2), new THREE.MeshBasicMaterial({ color: 0xff2a55, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }));
      strip.position.set(cx, 0.35, cz); strip.rotation.y = rotY; strip.renderOrder = 990; strip.frustumCulled = false; scene.add(strip); fxList.push({ m: strip, life: 0, max, kind: 'lpulse' });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(f.len, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: 0xff5a77, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
      edge.position.set(cx, 0.4, cz); edge.rotation.y = rotY; edge.renderOrder = 991; edge.frustumCulled = false; scene.add(edge); fxList.push({ m: edge, life: 0, max, kind: 'lpulse' });
    } else if (f.k === 'laserbeam') {
      // BAM: a searing beam along the line, plus a fat glow and a row of sparks.
      const cx = f.x + f.dx * f.len / 2, cz = f.z + f.dz * f.len / 2, rotY = Math.atan2(-f.dz, f.dx);
      const core = new THREE.Mesh(new THREE.BoxGeometry(f.len, 2.4, f.w * 2), new THREE.MeshBasicMaterial({ color: 0xffe2ea, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false }));
      core.position.set(cx, 2, cz); core.rotation.y = rotY; core.renderOrder = 999; core.frustumCulled = false; scene.add(core); fxList.push({ m: core, life: 0, max: 0.42, kind: 'beam', base: 0.98 });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(f.len, 4.5, f.w * 3.4), new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
      glow.position.set(cx, 2.4, cz); glow.rotation.y = rotY; glow.renderOrder = 998; glow.frustumCulled = false; scene.add(glow); fxList.push({ m: glow, life: 0, max: 0.5, kind: 'beam', base: 0.6 });
      const scar = new THREE.Mesh(new THREE.BoxGeometry(f.len, 0.12, f.w * 2), new THREE.MeshBasicMaterial({ color: 0x661022, transparent: true, opacity: 0.85, depthWrite: false }));
      scar.position.set(cx, 0.32, cz); scar.rotation.y = rotY; scene.add(scar); fxList.push({ m: scar, life: 0, max: 0.9, kind: 'glow' });
      for (let i = 0; i < 18; i++) { const u = Math.random(); const bx = f.x + f.dx * f.len * u + (Math.random() - 0.5) * f.w, bz = f.z + f.dz * f.len * u + (Math.random() - 0.5) * f.w; const m = new THREE.Mesh(fragGeo, new THREE.MeshBasicMaterial({ color: 0xff6688, transparent: true, opacity: 1 })); m.position.set(bx, 1.4, bz); const ang = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 18; scene.add(m); fxList.push({ m, life: 0, max: 0.7 + Math.random() * 0.3, kind: 'frag', vel: new THREE.Vector3(Math.cos(ang) * sp, 10 + Math.random() * 16, Math.sin(ang) * sp), spin: (Math.random() - 0.5) * 20 }); }
    } else if (f.k === 'death') { explode(f.x, f.z, true); if (f.fling) { const col = (roster.get(f.id) || {}).color || 0x3a6ea0; spawnRagdoll(f.x, f.z, f.vx || 0, f.vy || 20, f.vz || 0, col); const rec = playerMeshes.get(f.id); if (rec) rec.flung = true; }
    } else if (f.k === 'troopdie') { explode(f.x, f.z, false);
    } else if (f.k === 'pickup') {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 3, 20), new THREE.MeshBasicMaterial({ color: f.c || 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.5, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.5, kind: 'ring' });
      const g = new THREE.Sprite(glowMaterial(f.c || 0xffffff)); g.scale.set(6, 6, 1); g.position.set(f.x, 1.5, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.4, kind: 'glow' });
    } else if (f.k === 'meteor') {
      const R = f.r || 10;
      const b = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12), new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 2 })); b.position.set(f.x, 52, f.z); scene.add(b); fxList.push({ m: b, life: 0, max: 0.45, kind: 'meteor' });
      for (const rr of [R * 1.5, R * 2.3]) { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, rr, 40), new THREE.MeshBasicMaterial({ color: 0xff5520, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.8, kind: 'ring' }); }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 18, 12), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.45 })); dome.position.set(f.x, 1, f.z); scene.add(dome); fxList.push({ m: dome, life: 0, max: 0.5, kind: 'puff' });
      const g = new THREE.Sprite(glowMaterial(0xff7a33)); g.scale.set(R * 3, R * 3, 1); g.position.set(f.x, 4, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.55, kind: 'flash', base: R * 3 });
      for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(fragGeo, new THREE.MeshBasicMaterial({ color: [0xff3300, 0xff7a2a, 0xffcf3a][i % 3], transparent: true, opacity: 1 })); m.position.set(f.x, 1.5, f.z); const ang = Math.random() * Math.PI * 2, sp = 11 + Math.random() * 24; scene.add(m); fxList.push({ m, life: 0, max: 1.0 + Math.random() * 0.4, kind: 'frag', vel: new THREE.Vector3(Math.cos(ang) * sp, 13 + Math.random() * 20, Math.sin(ang) * sp), spin: (Math.random() - 0.5) * 22 }); }
    } else if (f.k === 'freeze') {
      const col = 0x8fe3ff, R = f.r || 12;
      for (const rr of [R * 1.3, R * 2.0]) { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, rr, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 1.0, kind: 'ring' }); }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28 })); dome.position.set(f.x, 1, f.z); scene.add(dome); fxList.push({ m: dome, life: 0, max: 0.85, kind: 'puff' });
      const g = new THREE.Sprite(glowMaterial(0x66ccff)); g.scale.set(R * 2.6, R * 2.6, 1); g.position.set(f.x, 3, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.7, kind: 'flash', base: R * 2.6 });
      for (let i = 0; i < 16; i++) { const ang = Math.random() * Math.PI * 2, rad = Math.random() * R * 0.85; const m = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6 + Math.random() * 2.4, 5), new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x2a7aa0, emissiveIntensity: 0.9, transparent: true, opacity: 0.92, flatShading: true })); m.position.set(f.x + Math.cos(ang) * rad, 0.4, f.z + Math.sin(ang) * rad); m.rotation.z = (Math.random() - 0.5) * 0.4; scene.add(m); fxList.push({ m, life: 0, max: 1.0, kind: 'spike' }); }
    } else if (f.k === 'rally') {
      const col = 0xff66aa, R = 12;
      for (const rr of [R, R * 1.6]) { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, rr, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.8, kind: 'ring' }); }
      const g = new THREE.Sprite(glowMaterial(col)); g.scale.set(R * 2.4, R * 2.4, 1); g.position.set(f.x, 4, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.6, kind: 'flash', base: R * 2.4 });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.7, 50, 18, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); pillar.position.set(f.x, 25, f.z); scene.add(pillar); fxList.push({ m: pillar, life: 0, max: 0.7, kind: 'pillar' });
    } else if (f.k === 'castlabel') {
      const spr = makeLabel(f.text, f.color || 0xffffff); spr.scale.set(12, 3, 1); spr.position.set(f.x, f.y || 10, f.z); scene.add(spr); fxList.push({ m: spr, life: 0, max: 1.7, kind: 'castlabel', y0: f.y || 10 });
    } else if (f.k === 'heal') {
      const col = 0x66ff88;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 11, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.5, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.9, kind: 'ring' });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 42, 18, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: THREE.DoubleSide })); pillar.position.set(f.x, 21, f.z); scene.add(pillar); fxList.push({ m: pillar, life: 0, max: 0.8, kind: 'pillar' });
      const g = new THREE.Sprite(glowMaterial(col)); g.scale.set(22, 22, 1); g.position.set(f.x, 6, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.6, kind: 'flash', base: 22 });
    } else if (f.k === 'mine' || f.k === 'minegold') {
      const big = f.k === 'minegold';
      const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 1.2 : 0.5, 6, 6), new THREE.MeshBasicMaterial({ color: 0xcfd6e0, transparent: true, opacity: 0.9 }));
      m.position.set(f.x, big ? 2 : 1.4, f.z); scene.add(m); fxList.push({ m, life: 0, max: big ? 0.5 : 0.2, kind: 'puff' });
    } else if (f.k === 'arrow') {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(f.x, 7, f.z), new THREE.Vector3(f.tx, 1.6, f.tz)]);
      const ln = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.95 })); scene.add(ln); fxList.push({ m: ln, life: 0, max: 0.16, kind: 'tracer' });
    } else if (f.k === 'troophit') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.9 }));
      m.position.set(f.x, 2, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.25, kind: 'puff' });
    } else if (f.k === 'chop' || f.k === 'treefell') {
      const big = f.k === 'treefell';
      const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 1.6 : 0.6, 6, 6), new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.9 }));
      m.position.set(f.x, big ? 3 : 2, f.z); scene.add(m); fxList.push({ m, life: 0, max: big ? 0.5 : 0.22, kind: 'puff' });
    } else if (f.k === 'ramimpact') {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 20, 32), new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.4, f.z); scene.add(m); fxList.push({ m, life: 0, max: 1.0, kind: 'ring' });
      const g = new THREE.Sprite(glowMaterial(0xffcc44)); g.scale.set(34, 34, 1); g.position.set(f.x, 5, f.z); scene.add(g); fxList.push({ m: g, life: 0, max: 0.7, kind: 'glow' });
    } else if (f.k === 'ramhitback') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.9 }));
      m.position.set(f.x, 3, f.z); scene.add(m); fxList.push({ m, life: 0, max: 0.3, kind: 'puff' });
    }
  }
  function spawnRagdoll(x, z, vx, vy, vz, color) {
    const g = new THREE.Group(); g.position.set(x, 2, z);
    const skin = new THREE.MeshStandardMaterial({ color: 0xe6c39a, roughness: 0.7, transparent: true, opacity: 1 });
    const cloth = new THREE.MeshStandardMaterial({ color: color || 0x3a6ea0, roughness: 0.6, transparent: true, opacity: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 0.95), cloth); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 10), skin); head.position.y = 1.55; g.add(head);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.42), cloth); arm.position.set(sx * 1.05, 0.2, 0); arm.rotation.z = sx * 0.6; g.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.5, 0.52), cloth); leg.position.set(sx * 0.42, -1.7, 0); g.add(leg);
    }
    if (realShadows) g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    scene.add(g);
    fxList.push({ m: g, life: 0, max: 2.8, kind: 'ragdoll', vel: new THREE.Vector3(vx, vy, vz), spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18) });
  }
  function updateFx(dt) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      const fx = fxList[i]; fx.life += dt; const t = fx.life / fx.max;
      if (fx.kind === 'ring') { fx.m.scale.setScalar(0.2 + t); fx.m.material.opacity = 0.85 * (1 - t); }
      else if (fx.kind === 'puff') { fx.m.scale.setScalar(1 + t * 2); fx.m.material.opacity = 0.85 * (1 - t); }
      else if (fx.kind === 'glow') { fx.m.material.opacity = 0.8 * (1 - t); }
      else if (fx.kind === 'meteor') { fx.m.position.y = 40 * (1 - t); }
      else if (fx.kind === 'frag') { fx.m.position.addScaledVector(fx.vel, dt); fx.vel.y -= 34 * dt; fx.m.rotation.x += fx.spin * dt; fx.m.rotation.y += fx.spin * dt; fx.m.material.opacity = 1 - t * t; if (fx.m.position.y < 0.25) { fx.m.position.y = 0.25; fx.vel.y *= -0.35; fx.vel.x *= 0.6; fx.vel.z *= 0.6; } }
      else if (fx.kind === 'flash') { fx.m.scale.setScalar(fx.base * (1 + t * 2)); fx.m.material.opacity = 1 - t; }
      else if (fx.kind === 'pillar') { fx.m.scale.x = fx.m.scale.z = 1 + t * 0.8; fx.m.rotation.y += dt * 5; fx.m.material.opacity = 0.55 * (1 - t); }
      else if (fx.kind === 'ragdoll') { fx.m.position.addScaledVector(fx.vel, dt); fx.vel.y -= 30 * dt; fx.m.rotation.x += fx.spin.x * dt; fx.m.rotation.y += fx.spin.y * dt; fx.m.rotation.z += fx.spin.z * dt; if (fx.m.position.y < 1) { fx.m.position.y = 1; fx.vel.y *= -0.4; fx.vel.x *= 0.55; fx.vel.z *= 0.55; fx.spin.multiplyScalar(0.6); } if (t > 0.7) { const o = Math.max(0, 1 - (t - 0.7) / 0.3); fx.m.traverse(c => { if (c.material) c.material.opacity = o; }); } }
      else if (fx.kind === 'spike') { fx.m.scale.y = Math.min(1.2, 0.25 + t * 2); fx.m.material.opacity = 0.9 * (1 - t); }
      else if (fx.kind === 'castlabel') { fx.m.position.y = fx.y0 + t * 7; fx.m.material.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3); }
      else if (fx.kind === 'tracer') { fx.m.material.opacity = 0.95 * (1 - t); }
      else if (fx.kind === 'lpulse') { const pulse = 0.5 + 0.5 * Math.sin(fx.life * 22); fx.m.material.opacity = (0.18 + 0.5 * t) * (0.5 + 0.5 * pulse); }   // ramps up + flashes as the charge completes
      else if (fx.kind === 'beam') { fx.m.material.opacity = fx.base * (1 - t * t); fx.m.scale.z = 1 - t * 0.4; }
      if (fx.life >= fx.max) { scene.remove(fx.m); fxList.splice(i, 1); }
    }
  }
  function resize(w, h, camera) { renderer.setSize(w, h, false); if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  function makeLabel(text, color) {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 52; const ctx = cv.getContext('2d');
    ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(ctx, 4, 4, 192, 44, 8); ctx.fill();
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0'); ctx.fillText(text, 100, 36);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })); spr.scale.set(5.5, 1.4, 1); spr.position.y = 4.4; return spr;
  }
  function makeHpBar() {
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 22; const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); spr.scale.set(4.4, 0.8, 1);
    function set(frac) {
      frac = Math.max(0, Math.min(1, frac)); ctx.clearRect(0, 0, 120, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, 1, 1, 118, 20, 6); ctx.fill();
      ctx.fillStyle = frac > 0.5 ? '#5ad94a' : frac > 0.25 ? '#e8c93a' : '#ff3a3a'; roundRect(ctx, 3, 3, Math.max(0, 114 * frac), 16, 5); ctx.fill();
      tex.needsUpdate = true;
    }
    set(1); return { spr, set };
  }

  return { THREE, scene, renderer, king, castle, playerMeshes, setRoster, applySnapshot, update, updateFx, resize,
    setLocalId: (id) => { localId = id; },
    setLocalPos: (id, x, z, a) => { const rec = ensurePlayer(id); rec.tx = x; rec.tz = z; rec.ta = a; rec.g.position.x = x; rec.g.position.z = z; rec.g.rotation.y = a; },
    setLocalKing: () => { localKing = true; },
    setKingPos: (x, z, a) => { kingT.x = x; kingT.z = z; if (typeof a === 'number') kingT.a = a; king.position.x = x; king.position.z = z; },
    setLocalWizard: () => { localWizard = true; },
    setWizPos: (x, z, a) => { wizT.x = x; wizT.z = z; if (typeof a === 'number') wizT.a = a; wizT.has = 1; wiz.position.x = x; wiz.position.z = z; },
    getPlayerMesh: (id) => playerMeshes.get(id), getWizPos: () => ({ x: wiz.position.x, z: wiz.position.z }), groundY: (x, z) => terrainY(x, z), setGeneral: () => {}, render: (cam) => renderer.render(scene, cam) };
}

// ---- scenery builders ----
function addMountains(scene, midZ) {
  // far ridge (deep, hazy) and a nearer ridge (a touch warmer) for layered depth
  const far = new THREE.MeshStandardMaterial({ color: 0x221b3a, roughness: 1, flatShading: true });
  const near = new THREE.MeshStandardMaterial({ color: 0x2c2447, roughness: 1, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0x9fabcc, roughness: 1, flatShading: true, emissive: 0x2a3354, emissiveIntensity: 0.3 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const ridge = i % 2;
    const h = 50 + Math.random() * 75;
    const baseR = 40 + Math.random() * 40;
    let r = (ridge ? 175 : 215) + Math.random() * 55;
    let px = Math.cos(a) * r, pz = midZ + Math.sin(a) * r;
    // the ring is centred on the lane midpoint, so back-side peaks can creep into Jeremy's arena — push any intruder outward
    while (Math.hypot(px - 0, pz - HILL.z) < baseR + 55) { r += 30; px = Math.cos(a) * r; pz = midZ + Math.sin(a) * r; if (r > 700) break; }
    const m = new THREE.Mesh(new THREE.ConeGeometry(baseR, h, 5), ridge ? near : far);
    m.position.set(px, h / 2 - 8, pz); m.rotation.y = Math.random() * 3; scene.add(m);
    if (h > 95) { const cap = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.32, h * 0.22, 5), snow); cap.position.set(m.position.x, h - 8 - h * 0.11, m.position.z); cap.rotation.y = m.rotation.y; scene.add(cap); }
  }
}
function addMoon(scene) {
  const halo = new THREE.Sprite(glowMaterial(0xbfd0ff)); halo.scale.set(96, 96, 1); halo.position.set(-120, 110, -181); halo.material.opacity = 0.45; scene.add(halo);
  const spr = new THREE.Sprite(glowMaterial(0xfff2cc)); spr.scale.set(58, 58, 1); spr.position.set(-120, 110, -180); scene.add(spr);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ color: 0xfff8e2 })); disc.position.set(-120, 110, -181); scene.add(disc);
  const cmat = new THREE.MeshBasicMaterial({ color: 0xddd2b8 });
  for (const c of [[-5, 4, 3], [6, -3, 2.4], [2, 7, 1.8], [-7, -6, 2], [8, 5, 1.4], [-2, -2, 1.2]]) { const cr = new THREE.Mesh(new THREE.CircleGeometry(c[2], 14), cmat); cr.position.set(-120 + c[0], 110 + c[1], -180.5); scene.add(cr); }
}
function addProps(scene, shadows) {
  const trunkGeo = new THREE.CylinderGeometry(0.6, 0.8, 5, 6); const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(3, 7, 7); const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f4a25, roughness: 1 });
  const rockGeo = new THREE.IcosahedronGeometry(1.6, 0); const rockMat = new THREE.MeshStandardMaterial({ color: 0x55505e, roughness: 1, flatShading: true });
  for (let i = 0; i < 46; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (LANE.halfWidth + 12 + Math.random() * 95);
    const z = LANE.minZ - 20 + Math.random() * (LANE.maxZ - LANE.minZ + 60);
    if (Math.random() > 0.35) {
      const g = new THREE.Group(); const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 2.5; const lf = new THREE.Mesh(leafGeo, leafMat); lf.position.y = 7; const lf2 = new THREE.Mesh(leafGeo, leafMat); lf2.position.y = 9.5; lf2.scale.setScalar(0.7);
      g.add(tr, lf, lf2); g.position.set(x, 0, z); g.scale.setScalar(0.8 + Math.random()); if (shadows) { tr.castShadow = true; lf.castShadow = true; } scene.add(g);
    } else { const r = new THREE.Mesh(rockGeo, rockMat); r.position.set(x, 0.6, z); r.scale.setScalar(0.7 + Math.random() * 1.6); r.rotation.set(Math.random(), Math.random(), Math.random()); if (shadows) r.castShadow = true; scene.add(r); }
  }
}
function addEmbers(scene, midZ, laneLen) {
  const N = 140; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * (LANE.halfWidth * 2 + 30); arr[i * 3 + 1] = Math.random() * 40; arr[i * 3 + 2] = midZ + (Math.random() - 0.5) * laneLen; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffb866, size: 0.62, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, map: _glowTex || null });
  const pts = new THREE.Points(geo, mat); scene.add(pts); return pts;
}

// ---- texture/material helpers ----
let _glowTex = null;
function glowMaterial(color) {
  if (!_glowTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); _glowTex = new THREE.CanvasTexture(cv); }
  return new THREE.SpriteMaterial({ map: _glowTex, color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
}
function bannerMaterial() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 224; const ctx = cv.getContext('2d');
  // deep crimson field with a subtle vertical sheen
  const bg = ctx.createLinearGradient(0, 0, 128, 0); bg.addColorStop(0, '#5e0e25'); bg.addColorStop(0.5, '#8a1638'); bg.addColorStop(1, '#5e0e25');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 224);
  // gold bands top & bottom
  ctx.fillStyle = '#ffd650'; ctx.fillRect(8, 8, 112, 12); ctx.fillRect(8, 204, 112, 12);
  // gold disc emblem with a crown-spike motif
  ctx.fillStyle = '#ffd650'; ctx.beginPath(); ctx.arc(64, 104, 34, 0, 7); ctx.fill();
  ctx.fillStyle = '#8a1638'; ctx.beginPath(); ctx.arc(64, 104, 22, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd650';
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 8, 104 + Math.sin(a) * 8); ctx.lineTo(64 + Math.cos(a) * 20, 104 + Math.sin(a) * 20 - 2); ctx.lineTo(64 + Math.cos(a + 0.18) * 8, 104 + Math.sin(a + 0.18) * 8); ctx.fill(); }
  ctx.beginPath(); ctx.arc(64, 104, 5, 0, 7); ctx.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
}
// Ground height anyone stands on: the flat-topped hill, its front climbing ramp down to the gate, else lane level.
function makeCrown() {   // gold crown floating over the elected General
  const g = new THREE.Group(); g.position.y = 4.78;
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.7, roughness: 0.25, emissive: 0x4a3600, emissiveIntensity: 0.4 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.32, 12), gold));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 6), gold); sp.position.set(Math.cos(a) * 0.5, 0.32, Math.sin(a) * 0.5); g.add(sp); }
  const gl = new THREE.Sprite(glowMaterial(0xffd23f)); gl.scale.set(3.4, 3.4, 1); gl.position.y = 0.2; g.add(gl);
  return g;
}
function terrainY(x, z) { return 0; }   // the back is a flat arena now — ground is level everywhere (cannon platform still lifts via liftY)
function angDiff(target, cur) { let d = (target - cur) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function gradientTexture(colors) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256); colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function laneTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const ctx = cv.getContext('2d');
  // grass base with mottling (a soft vertical gradient gives depth)
  const gg = ctx.createLinearGradient(0, 0, 0, 256); gg.addColorStop(0, '#3d7042'); gg.addColorStop(0.5, '#356439'); gg.addColorStop(1, '#3a6b3e');
  ctx.fillStyle = gg; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { ctx.fillStyle = ['#356439', '#467f4b', '#2f5c35', '#529054', '#3f7a44'][i % 5]; const s = 1.5 + Math.random() * 4; ctx.globalAlpha = 0.7 + Math.random() * 0.3; ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s); }
  ctx.globalAlpha = 1;
  // little flowers + clover specks
  for (let i = 0; i < 56; i++) { ctx.fillStyle = ['#f0dc55', '#ee7aa3', '#ffffff', '#c8e0ff'][i & 3]; const fx = Math.random() * 256, fy = Math.random() * 256; ctx.fillRect(fx, fy, 2, 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(fx, fy - 1, 1, 1); }
  // dirt path with warm gradient edges
  const pg = ctx.createLinearGradient(74, 0, 182, 0); pg.addColorStop(0, '#6c4d30'); pg.addColorStop(0.5, '#83613e'); pg.addColorStop(1, '#6c4d30');
  ctx.fillStyle = pg; ctx.fillRect(74, 0, 108, 256);
  for (let i = 0; i < 360; i++) { ctx.fillStyle = ['#6e4f31', '#8a6a45', '#5e4228', '#977850'][i & 3]; const s = 2 + Math.random() * 5; ctx.globalAlpha = 0.65 + Math.random() * 0.35; ctx.fillRect(74 + Math.random() * 108, Math.random() * 256, s, s); }
  ctx.globalAlpha = 1;
  // cobblestones along the path, with a subtle top highlight for relief
  for (let yy = 0; yy < 256; yy += 16) for (let xx = 80; xx < 176; xx += 18) { const ox = (yy / 16 % 2) * 9; const cx = xx + ox - 8, cy = yy + 1;
    ctx.fillStyle = (xx + yy) & 16 ? '#8a6942' : '#765636'; ctx.fillRect(cx, cy, 14, 12);
    ctx.fillStyle = 'rgba(210,180,130,0.35)'; ctx.fillRect(cx, cy, 14, 2);
    ctx.strokeStyle = 'rgba(34,22,12,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 1, cy - 1, 16, 14); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}


function addStars(scene) {
  const N = 420, arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = 300 + Math.random() * 140, a = Math.random() * Math.PI * 2, e = 0.1 + Math.random() * 0.5; arr[i*3] = Math.cos(a) * r; arr[i*3+1] = 110 + Math.sin(e) * r * 0.5; arr[i*3+2] = Math.sin(a) * r - 60; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeef2ff, size: 1.4, transparent: true, opacity: 0.85, depthWrite: false })));
  // a sparse layer of bigger, warmer "bright" stars for variety
  const M = 70, arr2 = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) { const r = 310 + Math.random() * 130, a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 0.45; arr2[i*3] = Math.cos(a) * r; arr2[i*3+1] = 120 + Math.sin(e) * r * 0.5; arr2[i*3+2] = Math.sin(a) * r - 60; }
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(arr2, 3));
  scene.add(new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xfff0d0, size: 2.6, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending })));
}
function addClouds(scene, midZ) {
  const out = [];
  for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(glowMaterial(0xdfe6ff)); const sc = 45 + Math.random() * 45; s.scale.set(sc, sc * 0.5, 1); s.position.set((Math.random() - 0.5) * 440, 78 + Math.random() * 40, midZ + (Math.random() - 0.5) * 320); s.material.opacity = 0.16 + Math.random() * 0.12; s.userData.spd = 4 + Math.random() * 7; scene.add(s); out.push(s); }
  return out;
}
function addGrass(scene) {
  const N = 320, geo = new THREE.ConeGeometry(0.26, 1.2, 4), mat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, N); inst.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0; for (let i = 0; i < N; i++) { const side = Math.random() > 0.5 ? 1 : -1; const x = side * (LANE.halfWidth + 4 + Math.random() * 75); const z = LANE.minZ - 10 + Math.random() * (LANE.maxZ - LANE.minZ + 40); const sc = 0.6 + Math.random() * 1.2; s.set(sc, sc, sc); p.set(x, 0.6 * sc, z); m.compose(p, q, s); inst.setMatrixAt(n++, m); }
  inst.count = n; inst.instanceMatrix.needsUpdate = true; scene.add(inst);
}
function addCamp(scene) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x62421f, roughness: 1, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x7a3038, roughness: 0.88 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: 0x3c4a78, roughness: 0.88 });
  const hay = new THREE.MeshStandardMaterial({ color: 0xd4ab3e, roughness: 1, flatShading: true });
  const cz = (CAMP.z0 + CAMP.z1) / 2;
  // --- front barricade: angled wooden stakes + rails, with a center gap to the lane ---
  for (let x = -LANE.halfWidth + 2; x <= LANE.halfWidth - 2; x += 2.6) {
    if (Math.abs(x) < 6) continue; // gap players run through
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 3.2, 5), wood); st.position.set(x, 1.3, CAMP.z0); st.rotation.x = 0.32; scene.add(st);
  }
  for (const sgn of [-1, 1]) {
    const railLen = LANE.halfWidth - 6;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.3, 0.3), wood); rail.position.set(sgn * (6 + railLen / 2), 1.7, CAMP.z0); rail.rotation.x = 0.32; scene.add(rail);
  }
  // --- campfire (to one side) ---
  const fire = new THREE.Group(); fire.position.set(-LANE.halfWidth + 8, 0, cz + 2);
  for (let i = 0; i < 4; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 5), wood); log.rotation.z = Math.PI / 2; log.rotation.y = i * 0.8; log.position.y = 0.4; fire.add(log); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 7), new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff6a1a, emissiveIntensity: 2 })); fl.position.y = 1.4; fire.add(fl);
  const glow = new THREE.Sprite(glowMaterial(0xff8a33)); glow.scale.set(9, 9, 1); glow.position.y = 1.5; fire.add(glow);
  fire.add(new THREE.PointLight(0xff7a33, 1.0, 32)); scene.add(fire);
  // --- decorative tents flanking the camp (the outer two spots are used by the hospital + troop camp) ---
  for (const tx of [-LANE.halfWidth + 14, LANE.halfWidth - 14]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(3, 3.6, 4), Math.random() > 0.5 ? cloth : cloth2); tent.rotation.y = Math.PI / 4; tent.position.set(tx, 1.8, CAMP.z1 - 3 - Math.random() * 3); scene.add(tent);
  }
  // --- supplies ---
  for (let i = 0; i < 10; i++) {
    const r = Math.random(); let o;
    if (r < 0.4) { o = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 8), wood); o.position.y = 0.9; }
    else if (r < 0.7) { o = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), wood); o.position.y = 0.8; }
    else { o = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 8), hay); o.rotation.z = Math.PI / 2; o.position.y = 1; }
    o.position.x = (Math.random() - 0.5) * (LANE.halfWidth * 1.6); o.position.z = CAMP.z0 + 3 + Math.random() * (CAMP.z1 - CAMP.z0 - 4); scene.add(o);
  }
  // --- ARMORY tent (walk up to buy weapons mid-round) ---
  const a = CAMP.armory; const arm = new THREE.Group(); arm.position.set(a.x, 0, a.z);
  const big = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 4), new THREE.MeshStandardMaterial({ color: 0x4a3b6b, roughness: 0.85 })); big.rotation.y = Math.PI / 4; big.position.y = 3; arm.add(big);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.5), wood); rack.position.set(0, 2.2, 3.4); arm.add(rack);
  for (let i = -1; i <= 1; i++) { const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 5), new THREE.MeshStandardMaterial({ color: 0xc2c6ce, metalness: 0.6 })); spear.position.set(i * 1.2, 3.4, 3.4); arm.add(spear); }
  const sign = new THREE.Sprite(glowMaterial(0xffd23f)); sign.scale.set(7, 7, 1); sign.position.set(0, 6.5, 0); arm.add(sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(a.r - 0.4, a.r, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; arm.add(ring);
  arm.add(new THREE.PointLight(0xffd27a, 0.8, 24));
  scene.add(arm);
  // --- ARMORER stall (walk up to pick a perk) ---
 
  const ar2 = CAMP.armorer; const armr = new THREE.Group(); armr.position.set(ar2.x, 0, ar2.z);
  const tent2 = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 4), new THREE.MeshStandardMaterial({ color: 0x2f5a4a, roughness: 0.85 })); tent2.rotation.y = Math.PI / 4; tent2.position.y = 3; armr.add(tent2);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.6, roughness: 0.4 })); anvil.position.set(0, 1, 3.2); armr.add(anvil);
  const sign2 = new THREE.Sprite(glowMaterial(0x66ff9a)); sign2.scale.set(7, 7, 1); sign2.position.set(0, 6.5, 0); armr.add(sign2);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(ar2.r - 0.4, ar2.r, 28), new THREE.MeshBasicMaterial({ color: 0x66ff9a, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.06; armr.add(ring2);
  armr.add(new THREE.PointLight(0x88ffbb, 0.7, 24));
  scene.add(armr);
  // --- TAILOR stall (buy cosmetics: hats, capes, helmets) ---
  const tc = CAMP.cosmetics; const tail = new THREE.Group(); tail.position.set(tc.x, 0, tc.z);
  const ttent = new THREE.Mesh(new THREE.ConeGeometry(5, 6, 4), new THREE.MeshStandardMaterial({ color: 0x7a3b6b, roughness: 0.85 })); ttent.rotation.y = Math.PI / 4; ttent.position.y = 3; tail.add(ttent);
  const tpole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a18 })); tpole.position.set(0, 2, 3.4); tail.add(tpole);
  const mhead = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshStandardMaterial({ color: 0xe6c39a })); mhead.position.set(0, 4.1, 3.4); tail.add(mhead);
  const mhat = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3 })); mhat.position.set(0, 4.95, 3.4); tail.add(mhat);
  const tsign = new THREE.Sprite(glowMaterial(0xff8ad6)); tsign.scale.set(7, 7, 1); tsign.position.set(0, 6.6, 0); tail.add(tsign);
  const tring = new THREE.Mesh(new THREE.RingGeometry(tc.r - 0.4, tc.r, 28), new THREE.MeshBasicMaterial({ color: 0xff8ad6, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); tring.rotation.x = -Math.PI / 2; tring.position.y = 0.06; tail.add(tring);
  tail.add(new THREE.PointLight(0xff8ad6, 0.7, 24));
  scene.add(tail);
}
