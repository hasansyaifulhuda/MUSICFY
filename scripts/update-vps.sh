#!/usr/bin/env bash
# ==============================================================================
# MusicFY - Production VPS Quick Update & Maintenance Script
# Pulls git updates, updates yt-dlp, rebuilds Next.js, and zero-downtime reloads PM2
# ==============================================================================

set -eo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}[INFO]${NC} Memulai pembaruan aplikasi MusicFY di VPS..."

# 1. Update yt-dlp to latest binary
echo -e "${BLUE}[INFO]${NC} Memperbarui engine yt-dlp ke versi terbaru..."
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# 2. Update containers if any newer images exist
echo -e "${BLUE}[INFO]${NC} Memeriksa update container Docker (Meilisearch & Umami)..."
docker compose pull
docker compose up -d

# 3. Pull latest Git changes
if [ -d ".git" ]; then
  echo -e "${BLUE}[INFO]${NC} Menarik commit terbaru dari repository Git..."
  git pull origin main || true
fi

# 4. Install dependencies & Rebuild
echo -e "${BLUE}[INFO]${NC} Menginstal dependensi baru & mem-build Next.js..."
npm install
npm run build

# 5. Zero-downtime reload via PM2
echo -e "${BLUE}[INFO]${NC} Mereload proses PM2..."
pm2 reload musicfy-web --update-env || pm2 restart musicfy-web

# 6. Re-sync Meilisearch search index
echo -e "${BLUE}[INFO]${NC} Menyinkronkan ulang index pencarian Meilisearch..."
APP_PORT=$(grep -E "^PORT=" .env.production .env.local .env 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d ' "\r' || echo "3000")
curl -s -X POST "http://127.0.0.1:${APP_PORT:-3000}/api/search/sync" > /dev/null || true

echo -e "${GREEN}${BOLD}✅ Pembaruan MusicFY selesai dan berjalan lancar!${NC}"
