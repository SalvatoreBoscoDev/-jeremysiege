# One command: commit, push to GitHub (backup), and deploy to the server.
#   .\deploy.ps1 "what changed"
param([string]$m = "update")
git add -A
git commit -m $m
if (git remote | Select-String -Quiet '^origin$') { git push origin main }
git push prod main
Write-Host ""
Write-Host "Deployed. The game restarts on the server automatically."
