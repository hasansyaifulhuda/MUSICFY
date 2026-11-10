#!/usr/bin/env bash
# ==============================================================================
# MusicFY TWA (Trusted Web Activity) / Bubblewrap Automated Builder
# Wraps live web app https://shanz.my.id into an Android APK.
# Every code change pushed to GitHub/VPS updates in the APK automatically!
# ==============================================================================

set -e

echo "🚀 [MusicFY TWA] Checking Bubblewrap CLI environment..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js 18+."
    exit 1
fi

# Ensure twa-manifest.json exists
if [ ! -f "twa-manifest.json" ]; then
    echo "❌ twa-manifest.json not found in project root!"
    exit 1
fi

echo "📦 Initializing or building TWA via Bubblewrap..."
if ! command -v bubblewrap &> /dev/null; then
    echo "⚡ Bubblewrap not found globally. Running via npx @bubblewrap/cli..."
    npx @bubblewrap/cli build --skipPwaValidation
else
    bubblewrap build --skipPwaValidation
fi

echo "✅ [MusicFY TWA] Build finished successfully!"
echo "📱 Output APK is ready in the output directory."
echo "🔗 Domain configured: https://shanz.my.id"
echo "✨ All updates deployed to https://shanz.my.id will reflect immediately on users' devices without rebuilding APK!"
