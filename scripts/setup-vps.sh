#!/usr/bin/env bash
# ==============================================================================
# MusicFY - One-Click Ubuntu VPS Production Setup & Deployment Script
# Provisions: Docker Compose (Meilisearch + Umami), Node 20, PM2, Nginx, SSL, yt-dlp & Deno
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

print_banner() {
  echo -e "${PURPLE}${BOLD}"
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║                🚀 MUSICFY - ONE-CLICK UBUNTU VPS DEPLOYMENT               ║"
  echo "║          Nginx + PM2 + Docker Compose (Umami & Meilisearch) + SSL         ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}${BOLD}[ERROR]${NC} $1" >&2; }

# Check sudo / root permissions
if [ "$EUID" -ne 0 ]; then
  if ! command -v sudo &> /dev/null; then
    log_error "Skrip ini memerlukan izin root atau sudo."
    exit 1
  fi
  SUDO="sudo"
else
  SUDO=""
fi

print_banner

# ------------------------------------------------------------------------------
# 0. Domain & Secret Configurations
# ------------------------------------------------------------------------------
DEFAULT_DOMAIN="shanz.my.id"
DOMAIN_NAME=""

if [ -n "$1" ]; then
  DOMAIN_NAME="$1"
elif [ -n "$APP_DOMAIN" ]; then
  DOMAIN_NAME="$APP_DOMAIN"
else
  if [ -t 0 ]; then
    read -rp "Masukkan domain Anda (contoh: shanz.my.id) [default: $DEFAULT_DOMAIN]: " INPUT_DOMAIN
    DOMAIN_NAME="${INPUT_DOMAIN:-$DEFAULT_DOMAIN}"
  else
    DOMAIN_NAME="$DEFAULT_DOMAIN"
  fi
fi

log_info "Domain target: ${CYAN}${BOLD}${DOMAIN_NAME}${NC}"

# ------------------------------------------------------------------------------
# 1. Update OS & Install Core System Packages
# ------------------------------------------------------------------------------
log_info "1/9 Memperbarui sistem dan menginstal paket dasar Ubuntu..."
$SUDO apt-get update -y
$SUDO apt-get install -y \
  curl \
  wget \
  git \
  unzip \
  jq \
  ca-certificates \
  gnupg \
  lsb-release \
  ufw \
  openssl \
  ffmpeg \
  python3 \
  python3-pip

# ------------------------------------------------------------------------------
# 2. Install yt-dlp & Deno Runtime
# ------------------------------------------------------------------------------
log_info "2/9 Menginstal versi terbaru yt-dlp dan Deno challenge solver..."

# yt-dlp
$SUDO wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
$SUDO chmod a+rx /usr/local/bin/yt-dlp
log_info "yt-dlp version: $(yt-dlp --version || echo 'installed')"

# Deno (Bypass YouTube JavaScript challenge)
if ! command -v deno &> /dev/null; then
  log_info "Menginstal Deno runtime..."
  curl -fsSL https://deno.land/install.sh | sh
  if [ -d "$HOME/.deno/bin" ]; then
    $SUDO ln -sf "$HOME/.deno/bin/deno" /usr/local/bin/deno || true
  fi
  export PATH="$HOME/.deno/bin:$PATH"
fi
log_info "Deno: $(deno --version 2>&1 | head -n 1 || echo 'ready')"

# ------------------------------------------------------------------------------
# 3. Install Docker Engine & Docker Compose Plugin
# ------------------------------------------------------------------------------
log_info "3/9 Memeriksa instalasi Docker Engine & Docker Compose..."
if ! command -v docker &> /dev/null; then
  log_info "Menginstal Docker CE resmi dari repository Ubuntu..."
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg

  UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "jammy")
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $UBUNTU_CODENAME stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable docker
  $SUDO systemctl start docker
fi
log_success "Docker Engine aktif: $(docker --version)"

# ------------------------------------------------------------------------------
# 4. Install Node.js 20 LTS & PM2
# ------------------------------------------------------------------------------
log_info "4/9 Memeriksa Node.js 20 LTS & PM2 Process Manager..."
NODE_MAJOR=0
if command -v node &> /dev/null; then
  NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
fi

if [ "$NODE_MAJOR" -lt 20 ]; then
  log_info "Menginstal Node.js 20 LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi
log_info "Node.js: $(node -v) | npm: $(npm -v)"

if ! command -v pm2 &> /dev/null; then
  log_info "Menginstal PM2 globally..."
  $SUDO npm install -g pm2
fi
log_success "PM2 aktif: $(pm2 -v)"

# ------------------------------------------------------------------------------
# 5. Configure Security & Firewall (UFW)
# ------------------------------------------------------------------------------
log_info "5/9 Mengonfigurasi firewall UFW..."
$SUDO ufw allow 22/tcp || true
$SUDO ufw allow 'Nginx Full' || $SUDO ufw allow 80/tcp && $SUDO ufw allow 443/tcp
$SUDO ufw --force enable || true
log_success "Firewall UFW aktif (Port 80, 443, dan 22 terbuka; port 3000, 3001, 7700 privat di localhost)."

# ------------------------------------------------------------------------------
# 6. Generate Environment Secrets & .env.production
# ------------------------------------------------------------------------------
log_info "6/9 Menyiapkan parameter rahasia environment..."

mkdir -p "$PROJECT_ROOT/logs"
ENV_FILE="$PROJECT_ROOT/.env.production"
ENV_LOCAL="$PROJECT_ROOT/.env.local"

# Generate strong random keys if not already present
GEN_MEILI_KEY=$(openssl rand -hex 24)
GEN_ADMIN_PASS="Admin_$(openssl rand -hex 6)"
GEN_ADMIN_JWT=$(openssl rand -hex 32)
GEN_UMAMI_DB_PASS=$(openssl rand -hex 16)
GEN_UMAMI_SECRET=$(openssl rand -hex 32)

# Preserve existing keys if found
if [ -f "$ENV_FILE" ]; then
  EXISTING_MEILI=$(grep -E "^MEILISEARCH_API_KEY=" "$ENV_FILE" | cut -d'=' -f2- || true)
  EXISTING_ADMIN=$(grep -E "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2- || true)
  EXISTING_JWT=$(grep -E "^ADMIN_JWT_SECRET=" "$ENV_FILE" | cut -d'=' -f2- || true)
  EXISTING_GEMINI=$(grep -E "^GEMINI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2- || true)
  EXISTING_UMAMI_ID=$(grep -E "^NEXT_PUBLIC_UMAMI_WEBSITE_ID=" "$ENV_FILE" | cut -d'=' -f2- || true)

  [ -n "$EXISTING_MEILI" ] && GEN_MEILI_KEY="$EXISTING_MEILI"
  [ -n "$EXISTING_ADMIN" ] && GEN_ADMIN_PASS="$EXISTING_ADMIN"
  [ -n "$EXISTING_JWT" ] && GEN_ADMIN_JWT="$EXISTING_JWT"
  [ -n "$EXISTING_GEMINI" ] && PRESERVED_GEMINI="$EXISTING_GEMINI"
  [ -n "$EXISTING_UMAMI_ID" ] && PRESERVED_UMAMI_ID="$EXISTING_UMAMI_ID"
fi

cat > "$ENV_FILE" <<EOF
# ==============================================================================
# MusicFY Production Environment Variables
# Auto-generated by scripts/setup-vps.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ==============================================================================
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_BASE_URL=https://${DOMAIN_NAME}

# Meilisearch Integration (Running inside Docker on 127.0.0.1:7700)
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_API_KEY=${GEN_MEILI_KEY}

# YouTube Scraping & Engine Resilience
MAX_CONCURRENT_YTDLP=3

# Secret Admin Mode (Tahap 4)
ADMIN_PASSWORD=${GEN_ADMIN_PASS}
ADMIN_JWT_SECRET=${GEN_ADMIN_JWT}

# Umami Analytics Docker & Client Integration
UMAMI_DB_PASSWORD=${GEN_UMAMI_DB_PASS}
UMAMI_APP_SECRET=${GEN_UMAMI_SECRET}
NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://${DOMAIN_NAME}/analytics.js
NEXT_PUBLIC_UMAMI_WEBSITE_ID=${PRESERVED_UMAMI_ID:-""}

# Google Gemini AI Integration (Tahap 3)
GEMINI_API_KEY=${PRESERVED_GEMINI:-""}
EOF

# Copy to .env.local as well for Next.js consistency
cp "$ENV_FILE" "$ENV_LOCAL"
chmod 600 "$ENV_FILE" "$ENV_LOCAL"

log_success "File environment berhasil disimpan di .env.production!"

# ------------------------------------------------------------------------------
# 7. Start Docker Compose (Meilisearch + Umami)
# ------------------------------------------------------------------------------
log_info "7/9 Menjalankan Docker Compose untuk Meilisearch & Umami Analytics..."

# Export vars for docker compose
export MEILISEARCH_API_KEY="$GEN_MEILI_KEY"
export UMAMI_DB_PASSWORD="$GEN_UMAMI_DB_PASS"
export UMAMI_APP_SECRET="$GEN_UMAMI_SECRET"

docker compose down || true
docker compose up -d

log_info "Menunggu container siap beroperasi (healthcheck)..."
sleep 5

# Check Meilisearch container
if docker compose ps | grep -q "musicfy-meilisearch"; then
  log_success "Meilisearch container aktif pada 127.0.0.1:7700"
else
  log_warn "Meilisearch container butuh beberapa saat untuk boot."
fi

# Check Umami container
if docker compose ps | grep -q "musicfy-umami"; then
  log_success "Umami container aktif pada 127.0.0.1:3001"
fi

# ------------------------------------------------------------------------------
# 8. Build Next.js & Start with PM2
# ------------------------------------------------------------------------------
log_info "8/9 Menginstal dependensi, mem-build Next.js, dan menjalankan PM2..."

npm install
npm run build

# Start or restart with PM2
pm2 delete musicfy-web 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Setup PM2 startup systemd script
$SUDO env PATH=$PATH:/usr/bin pm2 startup systemd -u "$(whoami)" --hp "$HOME" || true

log_success "Aplikasi MusicFY berhasil dijalankan melalui PM2!"

# ------------------------------------------------------------------------------
# 9. Configure Nginx Reverse Proxy & SSL (Certbot)
# ------------------------------------------------------------------------------
log_info "9/9 Mengonfigurasi Nginx Reverse Proxy & SSL..."

$SUDO apt-get install -y nginx certbot python3-certbot-nginx

NGINX_CONF_AVAILABLE="/etc/nginx/sites-available/musicfy"
NGINX_CONF_ENABLED="/etc/nginx/sites-enabled/musicfy"

# Render Nginx configuration with domain replacement
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN_NAME}/g" "$PROJECT_ROOT/config/nginx/musicfy.conf" | $SUDO tee "$NGINX_CONF_AVAILABLE" > /dev/null

# Link to sites-enabled
$SUDO ln -sf "$NGINX_CONF_AVAILABLE" "$NGINX_CONF_ENABLED"

# Remove default nginx site if exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  $SUDO rm -f /etc/nginx/sites-enabled/default
fi

# Test and reload Nginx
$SUDO nginx -t
$SUDO systemctl reload nginx
log_success "Nginx aktif dan merutekan traffic ke port 3000 & 3001!"

# Automatic SSL with Certbot if domain is not localhost
if [[ "$DOMAIN_NAME" != "localhost" && "$DOMAIN_NAME" != "127.0.0.1" ]]; then
  echo ""
  log_info "Memeriksa penerbitan sertifikat SSL gratis via Let's Encrypt (Certbot)..."
  if [ -t 0 ]; then
    read -rp "Apakah Anda ingin memasang SSL Let's Encrypt sekarang untuk $DOMAIN_NAME? (y/n) [default: y]: " INSTALL_SSL
    INSTALL_SSL="${INSTALL_SSL:-y}"
  else
    INSTALL_SSL="y"
  fi

  if [[ "$INSTALL_SSL" =~ ^[Yy]$ ]]; then
    log_info "Memproses sertifikat SSL untuk https://$DOMAIN_NAME..."
    $SUDO certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "admin@$DOMAIN_NAME" --redirect || {
      log_warn "Certbot belum berhasil (kemungkinan DNS A Record domain belum diarahkan ke IP VPS ini)."
      log_warn "Jalankan perintah ini secara manual setelah DNS terhubung: sudo certbot --nginx -d $DOMAIN_NAME"
    }
  fi
fi

# ------------------------------------------------------------------------------
# 10. Sync Initial Meilisearch Index
# ------------------------------------------------------------------------------
log_info "Menginisialisasi index lagu awal di Meilisearch..."
APP_PORT=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d ' "\r' || echo "3000")
curl -s -X POST "http://127.0.0.1:${APP_PORT:-3000}/api/search/sync" > /dev/null || true

# ------------------------------------------------------------------------------
# Final Summary Banner
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}        🎉 DEPLOYMENT VPS MUSICFY BERHASIL DISELESAIKAN DENGAN SEMPURNA!   ${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "🌐 ${BOLD}URL Aplikasi Web:${NC}     https://${DOMAIN_NAME}"
echo -e "📊 ${BOLD}Umami Analytics:${NC}      https://${DOMAIN_NAME}/analytics"
echo -e "   ├─ Default Login:      ${CYAN}admin${NC}"
echo -e "   └─ Default Sandi:      ${CYAN}umami${NC} (segera ganti setelah login pertama kali)"
echo -e "🔐 ${BOLD}Sandi Mode Rahasia:${NC}   ${YELLOW}${BOLD}${GEN_ADMIN_PASS}${NC} (Halaman /settings)"
echo -e "🔍 ${BOLD}Meilisearch Host:${NC}     http://127.0.0.1:7700"
echo -e "🔑 ${BOLD}Meilisearch Key:${NC}      ${GEN_MEILI_KEY}"
echo -e "${GREEN}${BOLD}───────────────────────────────────────────────────────────────────────────${NC}"
echo -e "🛠️  ${BOLD}Perintah Pengelolaan Server Cepat:${NC}"
echo -e "   • Cek status web app   : ${CYAN}pm2 status${NC}"
echo -e "   • Lihat log web app    : ${CYAN}pm2 logs musicfy-web${NC}"
echo -e "   • Cek status Docker    : ${CYAN}docker compose ps${NC}"
echo -e "   • Lihat log Umami/Meili: ${CYAN}docker compose logs -f${NC}"
echo -e "   • Restart Nginx        : ${CYAN}sudo systemctl restart nginx${NC}"
echo -e "   • Update kode aplikasi : ${CYAN}bash scripts/update-vps.sh${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
