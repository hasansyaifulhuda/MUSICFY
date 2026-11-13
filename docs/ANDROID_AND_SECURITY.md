# Panduan Deployment Tahap 4: Android APK & Keamanan Server VPS

Dokumen ini berisi panduan teknis lengkap untuk **Build APK Android** (Foreground Service, Dual Audio, Persistent Notification) dan **CrowdSec Security Tuning** untuk server Ubuntu VPS.

---

## 1. Kompilasi & Build APK Android (Capacitor)

Proyek MusicFY telah dikonfigurasikan secara native untuk berjalan di Android menggunakan **Capacitor 7/8** dengan fitur:
- **Foreground Service (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`)**: Menjaga aplikasi tetap aktif di memori Android, status bar, dan lock screen tanpa dibunuh oleh sistem saat membuka game berat seperti *Mobile Legends*.
- **Dual Audio (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` & `setWillPauseWhenDucked(false)`)**: Memastikan musik tetap mengalun berdampingan dengan efek suara (SFX) di dalam game tanpa saling mematikan.
- **Hardware Acceleration & Gesture-Free Autoplay**: Transisi antarmuka 60fps yang super mulus dan autoplay lagu selanjutnya tanpa interaksi manual.

### Langkah Build APK:

1. **Sinkronkan aset web ke Android:**
   ```bash
   npm run build
   npx cap sync android
   ```

2. **Kompilasi APK Debug langsung via CLI:**
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   *File APK hasil kompilasi akan berada di:*
   `android/app/build/outputs/apk/debug/app-debug.apk`

3. **Kompilasi APK Release (Siap Rilis/Produksi):**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
   *File APK rilis akan berada di:*
   `android/app/build/outputs/apk/release/app-release-unsigned.apk`

---

## 2. Umami Analytics & Mode Admin Rahasia

### Konfigurasi Umami Analytics
Tambahkan variabel berikut pada `.env.local` atau `.env` server:
```bash
# ID situs dari dashboard Umami Cloud / Self-hosted
NEXT_PUBLIC_UMAMI_WEBSITE_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# URL skrip pelacak (Default: https://cloud.umami.is/script.js)
NEXT_PUBLIC_UMAMI_SCRIPT_URL="https://cloud.umami.is/script.js"

# (Opsional) URL dashboard privat pemilik web
UMAMI_DASHBOARD_URL="https://cloud.umami.is/share/..."
```

### Akses Mode Admin Rahasia:
1. Buka halaman **Pengaturan (Settings)** di MusicFY.
2. Di bagian paling bawah (pada kartu Diagnostik), klik tombol **`Admin Analytics Mode (Rahasia)`**.
3. Masukkan kata sandi admin (dikonfigurasi melalui `ADMIN_PASSWORD` di berkas `.env`, default: `musicfy2026`).
4. Dashboard kendali admin akan terbuka menampilkan metrik real-time:
   - Penggunaan RAM, Uptime server, dan beban CPU.
   - Status antrean proses streaming & unduhan `yt-dlp`.
   - Kesehatan cluster Meilisearch (<50ms).
   - Kolam cookie aktif dan kuota cache disk MP3.
   - Tombol shortcut ke analitik Umami.

---

## 3. CrowdSec Security Tuning (Anti False-Positive Ban)

Aplikasi streaming musik mengirimkan banyak *HTTP Range Requests* (`bytes=0-1048576`) untuk pemutaran buffer audio serta pencarian instan Meilisearch per ketikan. Konfigurasi bawaan CrowdSec dapat salah mengira aktivitas ini sebagai *scraping* atau *DoS attack*.

### Cara Menjalankan Tuning Otomatis di Server Ubuntu:

1. **Jalankan skrip tuning CrowdSec:**
   ```bash
   chmod +x scripts/setup-crowdsec.sh
   ./scripts/setup-crowdsec.sh
   ```

2. **Aturan yang Diterapkan:**
   - **Streaming Whitelist (`/etc/crowdsec/parsers/s02-enrich/musicfy-whitelist.yaml`)**:
     Mengecualikan endpoint `/api/stream`, `/api/audio`, `/api/lyrics`, `/api/search`, dan asset Next.js dari pemicu pemblokiran IP saat merespons kode status `200`, `206` (Partial Content), atau `304`.
   - **Tuned DoS Scenario (`/etc/crowdsec/scenarios/musicfy-http-rate.yaml`)**:
     Meningkatkan ambang batas burst rate hingga 120 permintaan per 10 detik untuk API MusicFY, namun tetap sigap menangkis serangan scanning bot jahat (`.env`, `wp-admin`, SQL injection).

3. **Periksa status CrowdSec:**
   ```bash
   sudo cscli decisions list
   sudo cscli alerts list
   ```
