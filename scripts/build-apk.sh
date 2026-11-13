#!/usr/bin/env bash
# ==============================================================================
# MusicFY - Android Production APK Build & Signing Script
# Fully automated: Web Build -> Capacitor Sync -> Keystore Check -> Gradle Build -> Align & Sign
# ==============================================================================

set -eo pipefail

# Text formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Base directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
KEYSTORE_DIR="$ANDROID_DIR/keystores"
RELEASE_OUTPUT_DIR="$PROJECT_ROOT/release"
KEYSTORE_PROPERTIES="$ANDROID_DIR/keystore.properties"

# Default keystore config
DEFAULT_KEYSTORE_FILE="$KEYSTORE_DIR/musicfy-release.keystore"
DEFAULT_KEY_ALIAS="musicfy"
DEFAULT_KEY_PASS="musicfy_secret_2026"
DEFAULT_STORE_PASS="musicfy_secret_2026"

SKIP_WEB_BUILD=false
FORCE_GEN_KEYSTORE=false

print_banner() {
  echo -e "${CYAN}${BOLD}"
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║                  🎵 MUSICFY - ANDROID APK RELEASE BUILD                   ║"
  echo "║               Capacitor + Gradle + apksigner Automated Pipeline           ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${NC} $1" >&2
}

# Parse CLI options
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-web)
      SKIP_WEB_BUILD=true
      shift
      ;;
    --gen-keystore)
      FORCE_GEN_KEYSTORE=true
      shift
      ;;
    -h|--help)
      echo "Penggunaan: bash scripts/build-apk.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --skip-web      Lewati langkah 'npm run build' jika bundle Next.js sudah dibuat"
      echo "  --gen-keystore  Buat ulang file keystore signing production baru"
      echo "  -h, --help      Tampilkan panduan ini"
      exit 0
      ;;
    *)
      log_warn "Argumen tidak dikenal: $1 (diabaikan)"
      shift
      ;;
  esac
done

print_banner

# ------------------------------------------------------------------------------
# 1. Environment & Tooling Verification
# ------------------------------------------------------------------------------
log_info "1/6 Memeriksa environment dan dependensi build..."

# Check Node.js & npm
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
  log_error "Node.js atau npm tidak ditemukan! Silakan instal Node.js 20 LTS."
  exit 1
fi
log_info "Node.js: $(node -v) | npm: $(npm -v)"

# Check Java JDK
if ! command -v java &> /dev/null; then
  log_error "Java JDK tidak ditemukan! Instal OpenJDK 17 atau 21:"
  echo "  Ubuntu/Debian: sudo apt-get install -y openjdk-17-jdk"
  exit 1
fi
JAVA_VER=$(java -version 2>&1 | head -n 1)
log_info "Java runtime: $JAVA_VER"

if ! command -v keytool &> /dev/null; then
  log_error "keytool tidak ditemukan di PATH! Pastikan JDK terinstal lengkap."
  exit 1
fi

# Detect Android SDK & Build Tools
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
  # Search standard locations
  POSSIBLE_SDK_PATHS=(
    "$HOME/Android/Sdk"
    "/usr/lib/android-sdk"
    "/opt/android-sdk"
    "$HOME/Library/Android/sdk"
  )
  for path in "${POSSIBLE_SDK_PATHS[@]}"; do
    if [ -d "$path" ]; then
      export ANDROID_HOME="$path"
      export ANDROID_SDK_ROOT="$path"
      log_info "Android SDK ditemukan di: $ANDROID_HOME"
      break
    fi
  done
fi

if [ -n "$ANDROID_HOME" ]; then
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
  # Search for apksigner and zipalign in build-tools
  BUILD_TOOLS_DIR=$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -mindepth 1 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -n "$BUILD_TOOLS_DIR" ]; then
    export PATH="$BUILD_TOOLS_DIR:$PATH"
    log_info "Android Build Tools aktif: $BUILD_TOOLS_DIR"
  fi
fi

# ------------------------------------------------------------------------------
# 2. Next.js Web Build & Capacitor Sync
# ------------------------------------------------------------------------------
cd "$PROJECT_ROOT"

if [ "$SKIP_WEB_BUILD" = true ]; then
  log_info "2/6 Melewati build Next.js (--skip-web aktif)..."
else
  log_info "2/6 Mengompilasi Next.js Web Production Bundle..."
  npm run build
  log_success "Build Next.js selesai tanpa error!"
fi

log_info "Sinkronisasi aset dan konfigurasi Capacitor Android..."
npx cap sync android
log_success "Capacitor sync berhasil diselesaikan!"

# ------------------------------------------------------------------------------
# 3. Release Keystore Management
# ------------------------------------------------------------------------------
log_info "3/6 Memeriksa Production Keystore & Signing Credentials..."

mkdir -p "$KEYSTORE_DIR"
mkdir -p "$RELEASE_OUTPUT_DIR"

KEYSTORE_PATH="$DEFAULT_KEYSTORE_FILE"
KEY_ALIAS="$DEFAULT_KEY_ALIAS"
STORE_PASS="$DEFAULT_STORE_PASS"
KEY_PASS="$DEFAULT_KEY_PASS"

# Read from keystore.properties if present
if [ -f "$KEYSTORE_PROPERTIES" ] && [ "$FORCE_GEN_KEYSTORE" = false ]; then
  log_info "Membaca konfigurasi keystore dari $KEYSTORE_PROPERTIES..."
  PROP_FILE=$(grep -E "^storeFile=" "$KEYSTORE_PROPERTIES" | cut -d'=' -f2- || true)
  PROP_ALIAS=$(grep -E "^keyAlias=" "$KEYSTORE_PROPERTIES" | cut -d'=' -f2- || true)
  PROP_STORE_PASS=$(grep -E "^storePassword=" "$KEYSTORE_PROPERTIES" | cut -d'=' -f2- || true)
  PROP_KEY_PASS=$(grep -E "^keyPassword=" "$KEYSTORE_PROPERTIES" | cut -d'=' -f2- || true)

  [ -n "$PROP_FILE" ] && KEYSTORE_PATH="$PROP_FILE"
  [ -n "$PROP_ALIAS" ] && KEY_ALIAS="$PROP_ALIAS"
  [ -n "$PROP_STORE_PASS" ] && STORE_PASS="$PROP_STORE_PASS"
  [ -n "$PROP_KEY_PASS" ] && KEY_PASS="$PROP_KEY_PASS"
fi

# Override with environment variables if set
[ -n "$KEYSTORE_FILE" ] && KEYSTORE_PATH="$KEYSTORE_FILE"
[ -n "$KEY_ALIAS_ENV" ] && KEY_ALIAS="$KEY_ALIAS_ENV"
[ -n "$KEYSTORE_PASSWORD" ] && STORE_PASS="$KEYSTORE_PASSWORD"
[ -n "$KEY_PASSWORD" ] && KEY_PASS="$KEY_PASSWORD"

# Auto-generate keystore if file does not exist
if [ ! -f "$KEYSTORE_PATH" ] || [ "$FORCE_GEN_KEYSTORE" = true ]; then
  log_warn "File keystore tidak ditemukan atau --gen-keystore diaktifkan."
  log_info "Membuat release keystore RSA 4096-bit baru (valid 10.000 hari)..."

  # Ensure target directory exists
  mkdir -p "$(dirname "$KEYSTORE_PATH")"

  keytool -genkeypair -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 4096 \
    -validity 10000 \
    -storepass "$STORE_PASS" \
    -keypass "$KEY_PASS" \
    -dname "CN=MusicFY App, OU=Release, O=MusicFY, L=Jakarta, ST=DKI Jakarta, C=ID"

  log_success "Keystore baru berhasil dibuat di: $KEYSTORE_PATH"
fi

# Save/Update keystore.properties for Gradle
cat > "$KEYSTORE_PROPERTIES" <<EOF
# MusicFY Release Keystore Configuration (Auto-generated by build-apk.sh)
storeFile=$KEYSTORE_PATH
keyAlias=$KEY_ALIAS
storePassword=$STORE_PASS
keyPassword=$KEY_PASS
EOF
chmod 600 "$KEYSTORE_PROPERTIES"

# Export environment variables for Gradle build
export KEYSTORE_FILE="$KEYSTORE_PATH"
export KEY_ALIAS="$KEY_ALIAS"
export KEYSTORE_PASSWORD="$STORE_PASS"
export KEY_PASSWORD="$KEY_PASS"

# ------------------------------------------------------------------------------
# 4. Gradle Android Compilation
# ------------------------------------------------------------------------------
log_info "4/6 Menjalankan Gradle Release Compilation (assembleRelease)..."
cd "$ANDROID_DIR"
chmod +x gradlew

# Run gradle assembleRelease
./gradlew assembleRelease --no-daemon

APK_SIGNED_GRADLE="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
APK_UNSIGNED_GRADLE="$ANDROID_DIR/app/build/outputs/apk/release/app-release-unsigned.apk"

# ------------------------------------------------------------------------------
# 5. Signing & Zipalign Post-Processing
# ------------------------------------------------------------------------------
log_info "5/6 Verifikasi dan penandatanganan APK produksi..."

FINAL_TEMP_APK="$RELEASE_OUTPUT_DIR/app-release-temp.apk"
rm -f "$FINAL_TEMP_APK"

if [ -f "$APK_SIGNED_GRADLE" ]; then
  log_info "Gradle telah menandatangani APK secara otomatis melalui signingConfigs."
  cp "$APK_SIGNED_GRADLE" "$FINAL_TEMP_APK"
elif [ -f "$APK_UNSIGNED_GRADLE" ]; then
  log_info "Ditemukan APK unsigned: $APK_UNSIGNED_GRADLE. Memulai zipalign dan apksigner manual..."

  ALIGNED_APK="$RELEASE_OUTPUT_DIR/app-release-aligned.apk"
  rm -f "$ALIGNED_APK"

  if command -v zipalign &> /dev/null; then
    log_info "Menjalankan zipalign (4-byte page-aligned)..."
    zipalign -v -p 4 "$APK_UNSIGNED_GRADLE" "$ALIGNED_APK"
  else
    log_warn "zipalign tidak ditemukan di PATH, menggunakan file APK mentah..."
    cp "$APK_UNSIGNED_GRADLE" "$ALIGNED_APK"
  fi

  if command -v apksigner &> /dev/null; then
    log_info "Menandatangani APK menggunakan apksigner (v1, v2, v3 schemes)..."
    apksigner sign \
      --ks "$KEYSTORE_PATH" \
      --ks-key-alias "$KEY_ALIAS" \
      --ks-pass "pass:$STORE_PASS" \
      --key-pass "pass:$KEY_PASS" \
      --out "$FINAL_TEMP_APK" \
      "$ALIGNED_APK"
  elif command -v jarsigner &> /dev/null; then
    log_warn "apksigner tidak ditemukan, menandatangani menggunakan jarsigner fallback..."
    cp "$ALIGNED_APK" "$FINAL_TEMP_APK"
    jarsigner -verbose \
      -sigalg SHA256withRSA \
      -digestalg SHA-256 \
      -keystore "$KEYSTORE_PATH" \
      -storepass "$STORE_PASS" \
      -keypass "$KEY_PASS" \
      "$FINAL_TEMP_APK" "$KEY_ALIAS"
  else
    log_error "Baik apksigner maupun jarsigner tidak ditemukan! APK belum ditandatangani."
    exit 1
  fi
  rm -f "$ALIGNED_APK"
else
  log_error "Tidak ada file APK output yang ditemukan di $ANDROID_DIR/app/build/outputs/apk/release/!"
  exit 1
fi

# Verify signature if apksigner is installed
if command -v apksigner &> /dev/null; then
  log_info "Memverifikasi integritas signature APK..."
  apksigner verify --verbose "$FINAL_TEMP_APK" || {
    log_error "Verifikasi apksigner gagal!"
    exit 1
  }
  log_success "Signature APK 100% valid dan siap untuk distribusi produksi!"
fi

# ------------------------------------------------------------------------------
# 6. Artifact Finalization & Checksum
# ------------------------------------------------------------------------------
log_info "6/6 Menyiapkan file rilis final..."

VERSION_NAME=$(grep -E "versionName" "$ANDROID_DIR/app/build.gradle" | head -n 1 | awk '{print $2}' | tr -d '"' || echo "1.0")
FINAL_RELEASE_APK="$RELEASE_OUTPUT_DIR/MusicFY-v${VERSION_NAME}-release.apk"
LATEST_RELEASE_APK="$RELEASE_OUTPUT_DIR/MusicFY-latest.apk"

mv "$FINAL_TEMP_APK" "$FINAL_RELEASE_APK"
cp "$FINAL_RELEASE_APK" "$LATEST_RELEASE_APK"

# Compute checksums
SHA256_HASH=$(sha256sum "$FINAL_RELEASE_APK" | awk '{print $1}')
echo "$SHA256_HASH  $(basename "$FINAL_RELEASE_APK")" > "$RELEASE_OUTPUT_DIR/checksums.txt"

APK_SIZE=$(du -h "$FINAL_RELEASE_APK" | cut -f1)

echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}           🎉 BUILD APK PRODUCTION MUSICFY SELESAI DENGAN SUKSES!          ${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "📁 ${BOLD}File APK Rilis:${NC}       $FINAL_RELEASE_APK"
echo -e "📁 ${BOLD}Symlink/Latest:${NC}       $LATEST_RELEASE_APK"
echo -e "⚖️  ${BOLD}Ukuran File:${NC}          $APK_SIZE"
echo -e "🔐 ${BOLD}SHA256 Checksum:${NC}      $SHA256_HASH"
echo -e "🔑 ${BOLD}Keystore Digunakan:${NC}   $KEYSTORE_PATH (alias: $KEY_ALIAS)"
echo -e "${GREEN}${BOLD}───────────────────────────────────────────────────────────────────────────${NC}"
echo -e "📲 ${BOLD}Cara Install ke HP Android via ADB:${NC}"
echo -e "   ${CYAN}adb install -r \"$FINAL_RELEASE_APK\"${NC}"
echo -e "   atau transfer langsung file APK ke penyimpanan HP dan instal seperti biasa."
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
