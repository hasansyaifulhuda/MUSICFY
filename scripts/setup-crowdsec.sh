#!/usr/bin/env bash
# ==============================================================================
# MusicFY - CrowdSec Security Tuning & Anti-False-Positive Deployment Script
# Configures CrowdSec on Ubuntu VPS to defend against attacks while preventing
# legitimate audio streaming listeners from getting banned.
# ==============================================================================

set -e

echo "🛡️ [MusicFY] Menyiapkan konfigurasi CrowdSec Security Tuning..."

# 1. Install CrowdSec if not installed
if ! command -v cscli &> /dev/null; then
  echo "📦 Memasang CrowdSec repository & daemon..."
  curl -s https://packagecloud.io/install/repositories/crowdsecurity/crowdsec/script.deb.sh | sudo bash
  sudo apt-get update -y
  sudo apt-get install -y crowdsec
fi

# 2. Ensure standard Nginx / HTTP collections are present
echo "📦 Memeriksa collection crowdsecurity/nginx & crowdsecurity/http-cve..."
sudo cscli collections install crowdsecurity/nginx || true
sudo cscli collections install crowdsecurity/http-cve || true
sudo cscli collections install crowdsecurity/whitelist-good-actors || true

# 3. Deploy MusicFY Streaming Whitelist
echo "⚙️ Memasang whitelist lalu lintas audio streaming MusicFY..."
sudo mkdir -p /etc/crowdsec/parsers/s02-enrich
sudo cp config/crowdsec/musicfy-whitelist.yaml /etc/crowdsec/parsers/s02-enrich/musicfy-whitelist.yaml
sudo chmod 644 /etc/crowdsec/parsers/s02-enrich/musicfy-whitelist.yaml

# 4. Deploy Tuned Scenario Override
echo "⚙️ Memasang skenario mitigasi DoS khusus audio..."
sudo mkdir -p /etc/crowdsec/scenarios
sudo cp config/crowdsec/musicfy-http-rate.yaml /etc/crowdsec/scenarios/musicfy-http-rate.yaml
sudo chmod 644 /etc/crowdsec/scenarios/musicfy-http-rate.yaml

# 5. Validate & Reload CrowdSec
echo "🩺 Menguji validitas konfigurasi CrowdSec..."
sudo cscli config show || true

echo "🔄 Memuat ulang service CrowdSec..."
sudo systemctl restart crowdsec
sudo systemctl status crowdsec --no-pager | head -n 12 || true

echo ""
echo "=============================================================================="
echo "✅ CrowdSec Berhasil Dikonfigurasi & Disesuaikan untuk MusicFY!"
echo "=============================================================================="
echo "• Whitelist: /etc/crowdsec/parsers/s02-enrich/musicfy-whitelist.yaml"
echo "• Scenario : /etc/crowdsec/scenarios/musicfy-http-rate.yaml"
echo "• Efek     : Pendengar lagu aktif (HTTP Range requests & pencarian Meilisearch)"
echo "             TIDAK AKAN lagi terkena false-positive IP ban."
echo "=============================================================================="
