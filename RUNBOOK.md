# Hunt for Jeremy — Party-Day Runbook

Everything you need to run the game live at the party, plus how to recover if something
goes sideways. The game is server-authoritative and lives in memory, so the golden rule is:
**don't restart the server once a match is going.**

URLs (replace with your domain if different):
- Guests (phones):  `https://jeremysiege.com/`  →  redirects to `/play`
- King host:        `https://jeremysiege.com/king`
- Wizard host:      `https://jeremysiege.com/wizard`
- TV / big screen:  `https://jeremysiege.com/screen`

---

## 0. One-time, BEFORE the day: confirm which deploy path is live

The repo contains two historical deploy setups. Only one is actually running on the VPS.
SSH in and check:

```
systemctl status hunt-for-jeremy        # the game service — should be active (running) AND enabled
systemctl status caddy                   # if this is active -> you're on the Caddy + git-clone path
systemctl status cloudflared             # if THIS is active instead -> you're on the Cloudflare-tunnel path
cat /etc/systemd/system/hunt-for-jeremy.service   # note the WorkingDirectory and User
```

- If **caddy** is active → update path is: `cd <WorkingDirectory> && git pull && npm run setup && systemctl restart hunt-for-jeremy`
- If **cloudflared** is active → update path is whatever `deploy/post-receive` / `README-DEPLOY.md` describe (git push to the bare repo).

Write the real WorkingDirectory and the one update command you'll use on a sticky note.
Delete or ignore the other deploy docs so a panic-fix doesn't push to a dead path.

Confirm auto-restart is on (so a crash self-heals in ~2s):
```
systemctl is-enabled hunt-for-jeremy      # should say: enabled
```

## 0b. BEFORE the day: load test at party scale

From the VPS (or any machine), with the server running:
```
URL=wss://jeremysiege.com N=55 SECS=120 node loadtest.js
```
In another terminal watch the server health log:
```
journalctl -u hunt-for-jeremy -f
```
Look at the `[health] ... tick avg=Xms max=Yms budget=45ms` line. `avg` should stay well
under budget and `max` shouldn't ride at the budget for sustained periods. Also confirm
`clients=` matches ~55. If the tick is hot, lower expectations or reduce wave sizes via the
Wizard dashboard on the day.

## 0c. BEFORE the day: note the rollback point

```
cd <WorkingDirectory> && git rev-parse HEAD     # write down this SHA = "last known good"
```
Rollback if a bad deploy goes live:
```
cd <WorkingDirectory> && git reset --hard <good-sha> && npm run setup && systemctl restart hunt-for-jeremy
```

---

## 1. Pre-flight (15 min before guests)

1. SSH in, run `journalctl -u hunt-for-jeremy -f` and leave that window open — it's your dashboard.
2. Load `/`, `/king`, `/screen` in a browser. Confirm all three render.
3. Open **`/screen` on the TV** and **`/king` on your phone/tablet** — two *separate* devices, so losing one doesn't blind you. Bookmark both. (Optional: a second person on `/wizard`.)
4. **Freeze the code.** No more `git push` / deploys from here on — a restart mid-match wipes the game.

## 2. Running a match

1. Guests scan the QR on the TV (or type the URL). Watch the **Attackers** count on `/screen` climb toward 40-50. Cross-check against `clients=` in the health log.
2. **General vote:** while in the lobby the TV shows 3 nominated candidates; guests tap a name on their phone to vote. (Re-nominated automatically as people join.)
3. Press **START BATTLE** on `/king` when everyone's in. The most-voted player is crowned General (👑, +HP, free shotgun, a RALLY button).
4. Use **OPEN GATE** (King) to sally out, and **START NEXT ROUND** between rounds. 5 rounds; each round the gate and King refill to full.
5. At game over the TV + phones show the 🏆 MVP and final scoreboard. The game auto-returns to the lobby ~14s later.

## 3. Live balance (Wizard `/wizard` → ⚙ dashboard)

Sliders apply instantly to the live match (1.0 = default):
- **Gate HP / King HP** — raise if the gate/King die too fast at 50 players.
- **King Regen** — lower toward 0 if the King turtles into a stalemate; raise if he dies too easily.
- **General Power** — lower (e.g. 0.6) if the elected General feels like a win-button.
- **Troop Waves / Troop Damage / Player Damage / Wave Speed** — general difficulty knobs.

## 4. If something breaks

- **A guest's phone froze / shows "Reconnecting":** it now auto-reconnects on its own within a few seconds. If not, have them reload the URL — they rejoin live.
- **The whole game froze / everyone dropped (a crash):** systemd auto-restarts the process in ~2s, but the match state is lost. Check the `journalctl` window for the error, then press **Reset** on `/king`, have everyone reload, and start a fresh match. Manual restart only if needed: `sudo systemctl restart hunt-for-jeremy`.
- **You closed the King/TV tab:** just reopen the URL — the game state is on the server, so your controls rebind and the match continues.
- **Fresh match between groups:** press **Reset** on `/king` (no restart needed).

## What's already hardened (so you don't have to worry)
- Phones auto-reconnect after a WiFi blip and re-send their join.
- The server has crash guards (`uncaughtException` + a try/catch around the game tick) so one bad frame logs instead of killing the party.
- A 30s heartbeat reclaims sleeping/dropped phones so ghost players don't inflate difficulty.
- If everyone leaves mid-combat, the server returns itself to the lobby after 5s.
- App HTML/JS is served no-cache, so a deploy + reload is always fresh (no stale code on phones).
