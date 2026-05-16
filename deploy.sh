#!/bin/bash
# deploy.sh — Lokales Deploy ohne GitHub-Pflicht
# usage: ./deploy.sh

TS=$(date -u +%Y%m%d%H%M%S)
HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")

# version.json frisch schreiben
cat > version.json <<EOF
{"version":"${HASH}.${TS}","build":${TS:0:8},"v":1}
EOF

echo "[deploy] version.json → ${HASH}.${TS}"

# Optional: git commit wenn Repo sauber ist
if git diff --quiet 2>/dev/null; then
  git add -A && git commit -m "deploy: ${HASH}.${TS}" 2>/dev/null
fi

# Server läuft? Alle alten Prozesse killen, damit nur eine Instanz läuft
pids=$(pgrep -f "node server.js$" | grep -v $$)
for p in $pids; do
  kill "$p" 2>/dev/null
  echo "[deploy] killed PID $p"
done
sleep 1

nohup node server.js > /dev/null 2>&1 &
echo "[deploy] Server gestartet auf PID $(pgrep -f "node server.js$")"
