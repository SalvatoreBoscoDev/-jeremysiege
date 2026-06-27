# 🏰 Hunt for Jeremy

A chaotic 40-player browser party game built for Jeremy's birthday.

**Jeremy is the evil King.** Everyone else storms his castle to take him down.
Marin plays the **Evil Wizard** who heals and defends the King. Guests join from
their phones in seconds — no app install, just a web link or a QR scan.

- **Guests (phones):** tap a name, storm the castle, blast the King with 5 weapons. You respawn forever — keep charging.
- **Jeremy (PC browser):** plays the King. Mouse + keyboard attacks. His health scales with the crowd, so 40 people is a real fight.
- **Marin (PC browser):** the Evil Wizard. Heal the King, drop meteors, freeze the mob, raise walls of fire.
- **A TV / spare screen:** shows the live battle + a big QR code so guests can join.


## What changed in this version
- **Lane battlefield** (not an arena): guests spawn at the near end and charge up the lane toward the castle.
- **Jeremy's guards**: waves of troops march down the lane. They attack players (you respawn) AND **shield the King** — each living guard reduces his incoming damage, up to 85%. **Clear the lane to expose Jeremy.** A "guards / shield %" readout shows on every screen.
- **Way more King HP**: scales to a ~10-minute boss fight at a full party (≈325k HP at 40 players). Tune in `public/shared.js` (`KING.baseHp`, `KING.hpPerPlayer`).
- **Smoother**: client-side interpolation + lighter phone rendering fixes the lag.
- **Nicer graphics**: real castle, torches, sky, blob-shadowed units, a menacing King with a shield bubble.

### Quick-test trick
To test a fast kill without 40 phones, start with a tiny King:
```bash
JEREMY_HP=2000 npm start
```
This overrides the scaling so you can solo him in a few tabs.


## Rounds & the castle gate (Defend-Your-Castle mode)

The siege now plays out in **rounds**, like XGen's *Defend Your Castle*:

- **A castle GATE stands between the attackers and Jeremy.** Shots and the battering ram smash the gate first — **the King cannot be hurt until the gate falls** (he shimmers while protected). Break the gate, then rush in and kill him.
- **Rounds + intermission shop.** Waves come in timed rounds with a ~20s breather between. Kills earn the castle **gold**; during intermission Jeremy & Marin spend it in a shop: **Repair Gate, Reinforce (max HP), Heal King, Archer Tower** (auto-shoots attackers), **Bigger Guard waves**. Each round gets harder.
- **Win/lose:** attackers win if they breach the gate and kill Jeremy; **Jeremy wins if the castle survives all rounds.**

The old "guards shield the King" mechanic is retired — guards are now purely a threat, and the gate is the thing to break. Tune it all in `public/shared.js` (`GATE`, `ROUNDS`, `GOLD`, `SHOP`, `TOWER`). Handy test overrides: `ROUND_MS`, `INT_MS`, `ROUNDS_N`, `GATE_HP`, `GOLD_START`, `NO_TROOPS`.

---

## Quick start (any machine with Node 18+)

```bash
cd HuntForJeremy
npm install          # installs ws + three + qr lib
npm run setup        # copies browser libs into public/vendor (optional - already included)
npm start            # starts the server on port 8080
```

On launch the server prints every address it's reachable at, e.g.:

```
  Network: http://192.168.1.50:8080   <- guests scan/visit this
```

Then open the URLs:

| Who              | URL                              |
|------------------|----------------------------------|
| Guests (phones)  | `http://<server-ip>:8080/`       |
| Jeremy (King)    | `http://<server-ip>:8080/king`   |
| Marin (Wizard)   | `http://<server-ip>:8080/wizard` |
| Party TV screen  | `http://<server-ip>:8080/screen` |

The **/screen** page shows a QR code that points at the guest join page — put it on
the TV and let everyone scan it.

---

## Running it on your Proxmox box

Two easy options.

### Option A — LXC container or VM (recommended)

1. Create a Debian/Ubuntu LXC container (1 vCPU / 512MB RAM is plenty; bump to 2/1GB for 40+ players).
2. Inside it:
   ```bash
   apt update && apt install -y nodejs npm
   # copy this HuntForJeremy folder into the container (scp, shared mount, git, etc.)
   cd HuntForJeremy
   npm install
   npm start
   ```
3. Note the container's LAN IP (`ip a`). Guests on the same Wi-Fi visit `http://<container-ip>:8080/`.

### Option B — keep it running after you log out

Use a process manager so it survives reboots / disconnects:

```bash
npm install -g pm2
pm2 start server.js --name hunt-for-jeremy
pm2 save
pm2 startup        # follow the printed command to enable on boot
```

Or a quick systemd unit (`/etc/systemd/system/jeremy.service`):

```ini
[Unit]
Description=Hunt for Jeremy
After=network.target
[Service]
WorkingDirectory=/root/HuntForJeremy
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=8080
[Install]
WantedBy=multi-user.target
```
```bash
systemctl enable --now jeremy
```

### Networking notes
- Everyone (phones, Jeremy's PC, the TV) must be on the **same network** as the Proxmox host.
- Open port **8080** in the container/VM firewall if you have one (`ufw allow 8080`).
- Want a different port? `PORT=3000 npm start`.
- Exposing it to the public internet isn't required for a party and isn't recommended without a reverse proxy + HTTPS. If you do, put it behind Caddy/Nginx with TLS (the client auto-uses `wss://` on https pages).

---

## How to play

### Guests (phones)
- **Left thumb (left half):** drag to move (virtual joystick). Up = charge the castle.
- **Right thumb (right half):** drag to AIM - it auto-fires while held (twin-stick). Point left to shoot left, etc. A light aim-assist snaps onto a guard/Jeremy when you're roughly on target. (Desktop: aim with the mouse, hold click or Space to fire.)
- **Weapon buttons:** tap to switch between the 5 weapons.
- **Cut down the guards** blocking the lane — your aim auto-locks onto the nearest threat, then onto the King once it's clear. Killing guards drops the King's shield so your shots actually hurt him.
- You auto-respawn a few seconds after dying. The **gates open** once the King drops below 25% — then you can rush right up to him.

### Weapons (scarce - found on the ground)
Everyone spawns with the basic **Blaster**. The other four are **pickups scattered on the lane** - walk over a glowing crate to grab it. **If you die, you drop back to the Blaster**, so a good weapon is worth protecting.
1. **Blaster** - rapid energy bolts (your starting gun).
2. **Boomstick** - short-range shotgun spread (pickup).
3. **Grenade** - lobbed explosive, big splash (pickup).
4. **Cannon** - heavy bolt, small splash (pickup).
5. **Rocket** - slow, massive splash (pickup).

Dying is dramatic now too - players **explode into flying gibs** with a flash and shockwave. Tune pickups in `public/shared.js` (`PICKUP`).

### Jeremy (King) — `/king`
- **WASD** walk around your courtyard (smooth, bounded to the area in front of the gate); face the cursor to aim.
- **Left-click** the battlefield: aimed **Cannon Blast**.
- **Q**: **Ground Slam** around you. **E**: **Death Beam** — aim with the cursor; a warning strip flashes, then a searing laser fires down that line. **R**: **Summon** a fresh wave of guards (more guards = stronger shield).
- Press **START BATTLE** once everyone has joined (this locks in your health based on the crowd size). **Reset** starts a fresh round.

### Marin (Wizard) — `/wizard`
- Pick a spell with **1–4** or by clicking it, then **click the battlefield** to cast.
- **Heal** the King, **Meteor** the mob, **Frost Nova** to slow them, **Rally** to summon a guard squad (keeps the shield up).
- Spells cost mana, which regenerates over time.

---


## Coordination layer: the Battering Ram (new)

Beyond fighting, there's a teamwork loop that rewards organizing amid the chaos:

1. **Chop wood.** Behind the spawn is a forest. Walk to a tree and the FIRE button becomes **CHOP** — tap to fell trees. Each felled tree adds to a shared **wood** total (trees regrow).
2. **Deploy the ram.** Once the team gathers enough wood, a **battering ram** rolls onto the lane automatically.
3. **Push together.** Stand near the ram to push it toward the gate — the more people pushing, the faster. Jeremy can knock it back with his attacks.
4. **Shatter the shield.** When the ram reaches the gate it **smashes Jeremy's shield for ~15s** (and chunks his HP) — a huge coordinated burst window.

A smart crowd splits into lumberjacks, pushers, and fighters. Tune in `public/shared.js` (`FOREST`, `TREE`, `CHOP`, `RAM`).


## Attacker economy (wood + iron + gold)

The back-line gathering sits on the **flanks**, and both feed the ram:

- **LEFT = forest** -> fire at trees for **WOOD**. **RIGHT = quarry** -> fire at rocks for **IRON**.
- The **ram needs BOTH** wood and iron to deploy, so the team must balance the two ("too much wood, MINE IRON!"). Push it to the gate to smash it.
- **GOLD is personal, earned from kills.** In the **intermission** you spend it in a weapon shop to **permanently replace** your weapon. You also pick one **free perk** per round.
- Removed: ground weapon crates, gold-mining, team-vote perks.

Tune in `public/shared.js` (`FOREST`, `IRON`, `RAM`, `WEAPON_BUY`, `GOLD.perTroopKill`, `PERKS`).


### Side rooms + back camp
The forest and quarry are walled side rooms off the lane (openings near the spawn) - duck LEFT to chop WOOD, RIGHT to mine IRON. Behind the spawn is the attackers' CAMP: barricades, tents, campfire, and an ARMORY you can walk up to and buy weapons from mid-round. Tune in `public/shared.js` (`POCKET`, `FOREST`, `IRON`, `CAMP`).

## Tuning the game

All balance lives in **`public/shared.js`** — edit and restart the server:
- `KING.baseHp` / `KING.hpPerPlayer` — how tanky Jeremy is (per attacker).
- `WEAPONS` — damage, fire rate, splash for each weapon.
- `KING.attacks` / `WIZARD.spells` — cooldowns, damage, radius, mana.
- `PLAYER.respawnMs`, `PLAYER.speed`, `ARENA.radius`, etc.

Rule of thumb: time-to-kill stays roughly constant as players join (both the King's
HP and the incoming damage scale with the crowd). Lower `hpPerPlayer` for shorter rounds.

## Testing

```bash
node test/sim.mjs    # headless end-to-end test of the multiplayer protocol
```

## How it works (for the curious)
- **`server.js`** — authoritative Node game loop (20 Hz) over WebSockets. It owns all
  positions, health, hits, and the win condition; clients just send input and render snapshots.
- **`public/scene.js`** — the shared Three.js world (castle, King, players, projectiles, effects) reused by every view.
- **`public/play.html`** (phones), **`king.html`**, **`wizard.html`**, **`screen.html`** — the four views.
- Three.js and the QR library are vendored into `public/vendor/`, so **no internet is needed at the party**.

Have a great birthday, Jeremy. (Sorry about the meteors.)
