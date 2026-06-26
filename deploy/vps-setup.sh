#!/usr/bin/env bash
# One-shot setup for hosting Hunt for Jeremy on a FRESH Ubuntu 22.04/24.04 cloud VPS
# (a fat datacenter uplink — this is what makes 50 players smooth).
#
# On the new server, as root:
#   curl -fsSL https://raw.githubusercontent.com/SalvatoreBoscoDev/-jeremysiege/main/deploy/vps-setup.sh | DOMAIN=jeremysiege.com bash
#
# Then point DOMAIN's DNS A record at this server's public IP (in Cloudflare: set proxy to
# DNS-only / GREY cloud so Caddy can fetch its own HTTPS cert), and open https://DOMAIN.
set -euo pipefail

DOMAIN="${DOMAIN:-jeremysiege.com}"
REPO="${REPO:-https://github.com/SalvatoreBoscoDev/-jeremysiege.git}"
APP=/opt/hunt-for-jeremy

echo ">> [1/5] Base packages + Node 22 ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo ">> [2/5] Caddy (automatic HTTPS reverse proxy, WebSocket-aware) ..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

echo ">> [3/5] Clone the game + install ..."
rm -rf "$APP"
git clone "$REPO" "$APP"
cd "$APP"
npm install --omit=dev --no-audit --no-fund
npm run setup                         # vendors three.js into public/vendor (the client imports it)

echo ">> [4/5] Run it as a service ..."
cat >/etc/systemd/system/hunt-for-jeremy.service <<EOF
[Unit]
Description=Hunt for Jeremy game server
After=network.target
[Service]
Type=simple
WorkingDirectory=$APP
ExecStart=$(command -v node) server.js
Environment=PORT=8080
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now hunt-for-jeremy

echo ">> [5/5] HTTPS for $DOMAIN via Caddy ..."
cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
EOF
# open the web ports if a firewall is active (harmless if not)
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
systemctl restart caddy

echo ""
echo "============================================================"
echo " DONE. Game service + Caddy are running."
echo " Next:"
echo "   1) Point $DOMAIN's DNS A record at THIS server's public IP."
echo "      (Cloudflare: edit the record, set proxy to DNS-only / GREY cloud.)"
echo "   2) Wait a minute for DNS, then open https://$DOMAIN"
echo "      (Caddy auto-fetches a Let's Encrypt cert on first hit.)"
echo ""
echo " To update later:   cd $APP && git pull && npm run setup && systemctl restart hunt-for-jeremy"
echo " Health log:         journalctl -u hunt-for-jeremy -f"
echo "============================================================"
