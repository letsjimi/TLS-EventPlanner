#!/usr/bin/env bash
# watch-deploy.sh — Läuft als Hintergrund-Daemon auf dem lokalen Server
# Prüft alle 5 Sekunden ob JS/CSS/HTML sich änderte und deployt automatisch.
# Starten: nohup ./watch-deploy.sh &
# Beenden: kill $(cat .watch-deploy.pid)

WATCH_FILES=("js/app.js" "js/api.js" "js/auth.js" "js/db.js" "js/version-check.js" "sw.js" "index.html" "css/app.css" "css/mobile.css")
WATCH_DIR="/home/timon_u2/TLS-EventPlanner"
CHECK_INTERVAL=5

# Zustandsdateien
STATE_FILE="${WATCH_DIR}/.watch-deploy.state"
PID_FILE="${WATCH_DIR}/.watch-deploy.pid"

echo $$ > "$PID_FILE"
echo "[watch-deploy] PID $$ gestartet in $WATCH_DIR"
echo "[watch-deploy] Beobachte: ${WATCH_FILES[*]}"

build_state() {
  for f in "${WATCH_FILES[@]}"; do
    if [ -f "${WATCH_DIR}/$f" ]; then
      md5sum "${WATCH_DIR}/$f" || echo "MISSING $f"
    else
      echo "MISSING $f"
    fi
  done | md5sum
}

current_state=$(build_state)
[ -f "$STATE_FILE" ] || echo "$current_state" > "$STATE_FILE"
last_state=$(cat "$STATE_FILE")

while true; do
  current_state=$(build_state)
  if [ "$current_state" != "$last_state" ]; then
    echo "[watch-deploy] Änderung erkannt — deploye..."
    cd "$WATCH_DIR" && bash ./deploy.sh
    echo "$current_state" > "$STATE_FILE"
    last_state="$current_state"
  fi
  sleep "$CHECK_INTERVAL"
done
