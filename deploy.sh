#!/usr/bin/env bash
# One command: commit, push to GitHub (backup), and deploy to the server.
#   ./deploy.sh "what changed"
set -e
MSG="${1:-update}"
git add -A
git commit -m "$MSG" || echo "(nothing new to commit)"
# push to GitHub if an 'origin' remote exists (backup / history)
git remote get-url origin >/dev/null 2>&1 && (git push origin main || true)
# push to the server -> its post-receive hook checks out + restarts the game
git push prod main
echo ""
echo "Deployed. The game restarts on the server automatically."
x
