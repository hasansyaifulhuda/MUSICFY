#!/usr/bin/env bash
# ==============================================================================
# MusicFY - Ubuntu Server Deployment & Optimization Script (Tahap 2)
# Configures yt-dlp, ffmpeg, Deno (EJS challenge solver), Meilisearch & Systemd
# ==============================================================================

set -e

echo "🚀 [MusicFY] Memulai konfigurasi server backend Ubuntu..."

# 1. Update package list & install core dependencies
echo "📦 Menginstal dependensi sistem (ffmpeg, python3, curl, wget, jq)..."
sudo apt-get update -y
sudo apt-get install -y curl wget ffmpeg python3 python3-pip jq unzip ca-certificates

# 2. Install latest yt-dlp binary from official GitHub release
echo "📥 Menginstal yt-dlp terbaru..."
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version || true

# 3. Install Deno (Needed for yt-dlp EJS challenge solver)
echo "🦕 Menginstal Deno untuk bypass YouTube challenge solver..."
if ! command -v deno &> /dev/null; then
  curl -fsSL https://deno.land/install.sh | sh
  sudo ln -sf "$HOME/.deno/bin/deno" /usr/local/bin/deno || true
fi
deno --version || true

# 4. Install Meilisearch Binary
echo "🔍 Menginstal Meilisearch engine..."
if ! command -v meilisearch &> /dev/null; then
  curl -sSSL https://get.meilisearch.com | sh
  sudo mv meilisearch /usr/local/bin/meilisearch
  sudo chmod +x /usr/local/bin/meilisearch
fi
meilisearch --version || true

# 5. Setup Meilisearch data directory & systemd service
echo "⚙️ Mengonfigurasi Meilisearch systemd service..."
sudo mkdir -p /var/lib/meilisearch/data.ms
sudo mkdir -p /etc/meilisearch

# Generate random secure Master Key if not set
MEILI_KEY=$(openssl rand -hex 16)

sudo tee /etc/systemd/system/meilisearch.service > /dev/null <<EOF
[Unit]
Description=Meilisearch High-Performance Search Engine
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/meilisearch --db-path /var/lib/meilisearch/data.ms --env production --http-addr 127.0.0.1:7700 --master-key ${MEILI_KEY}
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable meilisearch
sudo systemctl restart meilisearch

# Wait for Meilisearch to boot
sleep 2

# 6. Verify Meilisearch Health
echo "🩺 Memverifikasi status kesehatan Meilisearch..."
HEALTH_STATUS=$(curl -s http://127.0.0.1:7700/health || echo '{"status":"offline"}')
echo "Status Meilisearch: $HEALTH_STATUS"

# 7. Configure .env.local file
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
fi

# Set or update environment parameters
grep -q "MEILISEARCH_HOST" "$ENV_FILE" && sed -i "s|MEILISEARCH_HOST=.*|MEILISEARCH_HOST=http://127.0.0.1:7700|" "$ENV_FILE" || echo "MEILISEARCH_HOST=http://127.0.0.1:7700" >> "$ENV_FILE"
grep -q "MEILISEARCH_API_KEY" "$ENV_FILE" && sed -i "s|MEILISEARCH_API_KEY=.*|MEILISEARCH_API_KEY=${MEILI_KEY}|" "$ENV_FILE" || echo "MEILISEARCH_API_KEY=${MEILI_KEY}" >> "$ENV_FILE"
grep -q "MAX_CONCURRENT_YTDLP" "$ENV_FILE" && sed -i "s|MAX_CONCURRENT_YTDLP=.*|MAX_CONCURRENT_YTDLP=3|" "$ENV_FILE" || echo "MAX_CONCURRENT_YTDLP=3" >> "$ENV_FILE"

echo ""
echo "=============================================================================="
echo "✅ Konfigurasi Ubuntu Server Selesai!"
echo "=============================================================================="
echo "• yt-dlp: $(yt-dlp --version 2>/dev/null || echo 'installed')"
echo "• ffmpeg: $(ffmpeg -version 2>&1 | head -n 1)"
echo "• Deno  : $(deno --version 2>&1 | head -n 1)"
echo "• Meilisearch Host    : http://127.0.0.1:7700"
echo "• Meilisearch API Key : ${MEILI_KEY}"
echo "• Environment File    : $ENV_FILE diperbarui secara otomatis."
echo "=============================================================================="

