# 🚀 Panduan Rilis Android APK & Deployment VPS Ubuntu (MusicFY)

Dokumen ini berisi panduan lengkap untuk melakukan:
1. **Automated Android Production APK Build** (Capacitor + Gradle + apksigner)
2. **One-Click Ubuntu VPS Deployment** (Nginx + PM2 + Docker Compose: Umami & Meilisearch + SSL Let's Encrypt)

---

## 📱 BAGIAN 1: BUILD APK PRODUCTION ANDROID

Seluruh proses build telah diotomatisasi melalui skrip:
[`scripts/build-apk.sh`](file:///home/shanz/Downloads/MusicFY-main/scripts/build-apk.sh)

### 1. Perintah Cepat (One-Command Build)
Jalankan perintah ini di root folder proyek:

```bash
# Jalankan skrip rilis otomatis
bash scripts/build-apk.sh
```
Atau via npm script:
```bash
npm run build:apk
```

### 2. Alur Kerja Otomatis Skrip:
1. **Pemeriksaan Dependensi**: Memverifikasi ketersediaan Node.js 20, Java OpenJDK (17/21), `keytool`, `apksigner`, dan path Android SDK.
2. **Kompilasi Web**: Menjalankan `npm run build` untuk menghasilkan bundle produksi Next.js.
3. **Capacitor Android Sync**: Menjalankan `npx cap sync android` untuk menyinkronkan seluruh aset web, ikon, dan plugin native.
4. **Manajemen Keystore**:
   - Jika belum ada keystore rilis, skrip otomatis membuat file keystore RSA 4096-bit berstandar industri dengan masa berlaku 10.000 hari (25+ tahun) di `android/keystores/musicfy-release.keystore`.
   - Konfigurasi credentials disimpan secara aman di `android/keystore.properties` (file ini dilindungi `.gitignore` agar sandi tidak terunggah ke git).
5. **Kompilasi Gradle Native**: Menjalankan `./gradlew assembleRelease --no-daemon` pada folder `android/`.
6. **Zipalign & Signing**:
   - Menjalankan `zipalign` 4-byte boundary alignment.
   - Menandatangani APK menggunakan `apksigner` dengan skema signature v1, v2, dan v3.
   - Memverifikasi validitas signature secara ketat.
7. **Output Rilis**:
   - File APK rilis disimpan di `release/MusicFY-v1.0-release.apk` dan `release/MusicFY-latest.apk`.
   - Checksum SHA-256 dibuat otomatis di `release/checksums.txt`.

### 3. Opsi Tambahan Skrip:
```bash
# Lewati kompilasi web jika bundle Next.js sudah dibuat sebelumnya
bash scripts/build-apk.sh --skip-web

# Paksa pembuatan ulang keystore rilis baru
bash scripts/build-apk.sh --gen-keystore
```

### 4. Instalasi ke Smartphone Android:
```bash
adb install -r release/MusicFY-latest.apk
```
Atau transfer file `MusicFY-latest.apk` langsung ke HP melalui USB/WhatsApp/Drive dan pasang secara langsung.

---

## 🖥️ BAGIAN 2: ONE-CLICK UBUNTU VPS DEPLOYMENT

Deployment VPS mengintegrasikan arsitektur hybrid performa tinggi:
- **Next.js 15 Web/PWA**: Dikelola oleh PM2 (`ecosystem.config.cjs`) pada port 3000.
- **Meilisearch & Umami Analytics**: Berjalan di dalam Docker Compose (`docker-compose.yml`) pada port lokal 7700 & 3001.
- **Nginx Reverse Proxy**: Mengelola traffic HTTP/HTTPS, SSL Let's Encrypt gratis, HTTP Range Streaming (0-buffer audio streaming), dan WebSocket upgrades.
- **yt-dlp & Deno**: Terinstal di sistem untuk proses scraping audio anti-blokir.

### 1. Eksekusi Skrip Sekali Klik
Login ke VPS Ubuntu Anda (versi 20.04, 22.04, atau 24.04), lalu jalankan:

```bash
# Berikan hak akses eksekusi jika belum
chmod +x scripts/setup-vps.sh

# Jalankan skrip setup (Ganti domain sesuai domain Anda)
bash scripts/setup-vps.sh shanz.my.id
```

### 2. Apa Saja yang Dilakukan Skrip Ini Secara Otomatis?
1. **Update OS & Dependensi**: Menginstal `curl`, `wget`, `ffmpeg`, `git`, `jq`, `ufw`, `python3`, dan `openssl`.
2. **Instal Engine Audio**: Menginstal binary resmi terbaru `yt-dlp` dan `deno` (challenge solver).
3. **Instalasi Docker Engine**: Menginstal Docker CE dan Docker Compose plugin resmi.
4. **Instalasi Node.js 20 & PM2**: Menginstal Node.js 20 LTS dari NodeSource dan PM2 process manager secara global.
5. **Konfigurasi Firewall (UFW)**: Membuka port 22 (SSH), 80 (HTTP), dan 443 (HTTPS). Menjaga port 3000, 3001, dan 7700 tetap privat di `127.0.0.1`.
6. **Pembuatan Kunci Rahasia**: Otomatis menghasilkan key acak 256-bit untuk `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`, `MEILISEARCH_API_KEY`, dan database Umami ke dalam `.env.production`.
7. **Orkestrasi Docker**: Menjalankan Meilisearch dan Umami via `docker compose up -d`.
8. **Build & PM2 Startup**: Menjalankan `npm install`, `npm run build`, menyalakan daemon PM2, dan mengaktifkan startup script agar auto-restart saat VPS reboot.
9. **Reverse Proxy Nginx & SSL**: Mengonfigurasi Nginx dengan tuning HTTP Range audio streaming, WebSocket proxy, serta menerbitkan sertifikat SSL Let's Encrypt gratis via Certbot.
10. **Inisialisasi Search Engine**: Memanggil sinkronisasi awal index lagu ke Meilisearch.

### 3. Skrip Perawatan / Pembaruan Harian (Daily Maintenance)
Ketika ada pembaruan kode di GitHub, Anda cukup menjalankan:

```bash
bash scripts/update-vps.sh
```
Skrip ini akan secara otomatis:
- Memperbarui binary `yt-dlp` ke rilis terbaru.
- Melakukan `git pull`.
- Menjalankan `npm install` dan `npm run build`.
- Mereload PM2 dengan zero-downtime (`pm2 reload musicfy-web`).
- Memperbarui index pencarian Meilisearch.

---

## 🔑 AKSES KREDENSIAL DEFAULT

Setelah script selesai berjalan:
- **Web App**: `https://<domain>`
- **Umami Analytics Dashboard**: `https://<domain>/analytics`
  - Default Username: `admin`
  - Default Password: `umami` (Wajib diganti setelah login pertama di menu Settings Umami)
- **Secret Admin Mode**: Masuk ke menu `Settings` (`/settings`) pada web app, klik ikon gembok, lalu masukkan `ADMIN_PASSWORD` yang ditampilkan di terminal saat setup selesai.
