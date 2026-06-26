# Hunt for Jeremy — Hosting & Auto-Deploy

You run **one command** from your laptop and the game updates live on your server.
Flow: `git push` → server's hook checks out the code → restarts the game → Cloudflare
Tunnel serves it at your URL.

There are three one-time setups (server, GitHub, Cloudflare). After that, deploying
is a single command forever.

---

## Part A — One-time: the Ubuntu VM (on Proxmox)

1. Make sure you can SSH into the VM as **root** (or a sudo user) and that your
   laptop's SSH key is on it. (Quick key, if you don't have one:
   `ssh-keygen -t ed25519` on your laptop, then `ssh-copy-id root@<server-ip>`.)

2. Copy the setup script up and run it:
   ```bash
   scp deploy/server-setup.sh root@<server-ip>:/root/
   ssh root@<server-ip> "bash /root/server-setup.sh"
   ```
   This installs Node, creates the `hfj` deploy user, a bare git repo with an
   auto-deploy hook, and a systemd service that keeps the game running and
   restarts it on boot. It reuses your root SSH key for the `hfj` user so you can
   push as `hfj`.

   (If your key isn't on root, pass it explicitly:
   `sudo PUBKEY="ssh-ed25519 AAAA... you@laptop" bash /root/server-setup.sh`)

---

## Part B — One-time: connect your local repo

From the project folder on your laptop (`HuntForJeremy`):

```bash
# 0. Initialize git (run once on your machine).
#    NOTE: a partial ".git" folder may exist from setup - delete it first:
#       Windows (PowerShell):  Remove-Item -Recurse -Force .git
#       mac/linux/git-bash:    rm -rf .git
git init -b main
git add -A
git commit -m "initial commit"

# 1. (GitHub, optional but recommended for backup/history)
#    Create an empty repo at github.com/<you>/hunt-for-jeremy, then:
git remote add origin git@github.com:<you>/hunt-for-jeremy.git

# 2. The server deploy remote (this is what actually deploys):
git remote add prod ssh://hfj@<server-ip>/opt/hunt-for-jeremy.git

# 3. First push (deploys + starts the game):
git push -u origin main      # if using GitHub
git push prod main           # deploys to the server
```

The game is now running on the VM at `http://<server-ip>:8080` (LAN).

---

## Part C — One-time: the public URL (Cloudflare Tunnel)

WebSockets work through Cloudflare Tunnel automatically — no port-forwarding,
nothing exposed on your router.

**Fastest test (instant throwaway URL):**
```bash
ssh root@<server-ip>
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared tunnel --url http://localhost:8080
```
It prints a `https://something.trycloudflare.com` URL — share that. (URL changes
each run; good for testing.)

**Permanent URL on your own domain (recommended for the party):**
```bash
cloudflared tunnel login                         # opens a browser, pick your domain
cloudflared tunnel create hunt-for-jeremy        # note the Tunnel ID it prints
# edit deploy/cloudflared-config.yml: put in the Tunnel ID + your hostname,
# then copy it to the server:
sudo mkdir -p /etc/cloudflared
sudo cp cloudflared-config.yml /etc/cloudflared/config.yml
cloudflared tunnel route dns hunt-for-jeremy jeremy.yourdomain.com
cloudflared service install                       # runs the tunnel on boot
```
Now `https://jeremy.yourdomain.com` is your permanent game URL.
The `/screen` (TV), `/king`, `/wizard`, and join (`/`) routes all live under it.

---

## Daily use — deploy an update

After you change anything, from the project folder:

```bash
./deploy.sh "made the castle taller"      # mac / linux / git-bash / WSL
```
or on Windows PowerShell:
```powershell
.\deploy.ps1 "made the castle taller"
```

That commits, pushes to GitHub (if set up), and pushes to the server — which
auto-checks-out and restarts the game. Players just refresh.

---

## Handy server commands
```bash
ssh hfj@<server-ip>
sudo systemctl status hunt-for-jeremy      # is it running?
journalctl -u hunt-for-jeremy -f           # live logs
sudo systemctl restart hunt-for-jeremy     # manual restart
```
