#!/bin/bash
# ───────────────────────────────────────────────
# TLS Event Manager — Build & Deploy Script
# ───────────────────────────────────────────────

set -e

IMAGE_NAME="tls-eventmanager"
CONTAINER_NAME="tls-eventmanager"
PORT="3000"

echo "🔧 TLS Event Manager — Docker Build"
echo "==================================="

# Prüfe Docker
echo "📦 Docker prüfen..."
docker --version > /dev/null 2>&1 || { echo "❌ Docker nicht installiert"; exit 1; }

# Stoppe alten Container
echo "🛑 Stoppe laufende Container..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Baue Image
echo "🏗️  Baue Docker Image..."
docker build -t $IMAGE_NAME:latest .

# Starte Container
echo "🚀 Starte Container auf Port $PORT..."
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p $PORT:80 \
  -v "$(pwd)/backups:/usr/share/nginx/html/backups" \
  $IMAGE_NAME:latest

# Health Check
echo "⏳ Warte auf Health-Check..."
sleep 3
if curl -sf http://localhost:$PORT/ >/dev/null; then
    echo "✅ Container läuft auf http://localhost:$PORT"
else
    echo "⚠️  Health-Check fehlgeschlagen, prüfe Logs:"
    docker logs $CONTAINER_NAME --tail 20
    exit 1
fi

echo ""
echo "🎉 Fertig! TLS Event Manager ist bereit:"
echo "   🌐 http://localhost:$PORT"
echo "   📁 Backups: ./backups/"
echo ""
echo "   Nützliche Befehle:"
echo "   docker logs -f $CONTAINER_NAME    # Logs ansehen"
echo "   docker restart $CONTAINER_NAME    # Neustarten"
echo "   docker compose down               # Stoppen"
echo ""
