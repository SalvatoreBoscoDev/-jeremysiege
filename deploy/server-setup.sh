#!/usr/bin/env bash
# =============================================================================
#  Hunt for Jeremy - one-time server bootstrap (run on the Ubuntu VM as root)
#  Sets up: Node, a bare git repo with auto-deploy hook, a systemd service,
#  and the 'hfj' deploy user. Run once. Safe to re-run.
#
#  Usage (on the VM):
#     sudo bash server-setup.sh
#  Optional: paste your laptop's SSH public key so you can push:
#     sudo PUBKEY="ssh-ed25519 AAAA... you@laptop" bash server-setup.sh
# =============================================================================
set -e
APP_USER=hfj
APP_DIR=/opt/hunt-for-jeremy
REPO_DIR=/opt/hunt-for-jeremy.git
NODE_MAJOR=20

echo ">> Installing prerequisites (git, curl, node ${NODE_MAJOR}) ..."
apt-get update -y
apt-get install -y git curl ca-certificates
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo ">> node $(node -v),  npm $(npm -v)"

echo ">> Creating deploy user '${APP_USER}' ..."
id -u "$APP_USER" >/dev/null 2>&1 || adduser --system --group --shell /bin/bash --home "/home/${APP_USER}" "$APP_USER"
mkdir -p "/home/${APP_USER}/.ssh"; chmod 700 "/home/${APP_USER}/.ssh"
# allow you to SSH/push as hfj using the same key that logs into root (or a provided PUBKEY)
if [ -f /root/.ssh/authorized_keys ]; then cat /root/.ssh/authorized_keys >> "/home/${APP_USER}/.ssh/authorized_keys"; fi
if [ -n "${PUBKEY:-}" ]; then echo "$PUBKEY" >> "/home/${APP_USER}/.ssh/authorized_keys"; fi
sort -u "/home/${APP_USER}/.ssh/authorized_keys" -o "/home/${APP_USER}/.ssh/authorized_keys" 2>/dev/null || true
chmod 600 "/home/${APP_USER}/.ssh/authorized_keys" 2>/dev/null || true
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.ssh"

echo ">> Creating bare repo + app dir ..."
mkdir -p "$APP_DIR" "$REPO_DIR"
git init --bare "$REPO_DIR" >/dev/null
# install the auto-deploy hook (this file ships in the repo at deploy/post-receive,
# but on first setup we write it directly so the very first push works)
cat > "${REPO_DIR}/hooks/post-receive" <<'HOOK'
#!/usr/bin/env bash
set -e
APP=/opt/hunt-for-jeremy
GIT_DIR=/opt/hunt-for-jeremy.git
BRANCH=main
echo ""; echo "  >> Deploying Hunt for Jeremy ..."
mkdir -p "$APP"
git --work-tree="$APP" --git-dir="$GIT_DIR" checkout -f "$BRANCH"
cd "$APP"
npm install --omit=dev --no-audit --no-fund
sudo /usr/bin/systemctl restart hunt-for-jeremy
echo "  >> Done. Live again in a second."; echo ""
HOOK
chmod +x "${REPO_DIR}/hooks/post-receive"
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR" "$REPO_DIR"

echo ">> Installing systemd service ..."
cat > /etc/systemd/system/hunt-for-jeremy.service <<'UNIT'
[Unit]
Description=Hunt for Jeremy game server
After=network.target

[Service]
Type=simple
User=hfj
WorkingDirectory=/opt/hunt-for-jeremy
ExecStart=/usr/bin/node server.js
Environment=PORT=8080
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

echo ">> Allowing '${APP_USER}' to restart the service without a password ..."
echo "${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart hunt-for-jeremy, /usr/bin/systemctl status hunt-for-jeremy" > /etc/sudoers.d/hfj
chmod 440 /etc/sudoers.d/hfj

systemctl daemon-reload
systemctl enable hunt-for-jeremy >/dev/null 2>&1 || true

echo ""
echo "============================================================"
echo "  Server is ready."
echo "  Bare repo (push here):  ${APP_USER}@<server-ip>:${REPO_DIR}"
echo ""
echo "  Next, from your laptop:"
echo "    git remote add prod ssh://${APP_USER}@<server-ip>${REPO_DIR}"
echo "    git push prod main          # deploys + starts the game"
echo ""
echo "  Then set up the public URL with Cloudflare Tunnel"
echo "  (see README-DEPLOY.md, Part C)."
echo "============================================================"
