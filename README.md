# 🎵 MusicFY - Modern Music Streaming Web & Mobile Platform

MusicFY adalah platform pemutar dan penjelajah musik modern dengan antarmuka elegan terinspirasi Spotify, performa tinggi bertenaga Next.js 15, React 19, Tailwind CSS, IndexedDB offline storage, dan AI-powered smart search.

---

## ⚡ Panduan Konfigurasi Port Dinamis (Dynamic Port Configuration)

MusicFY dilengkapi dengan sistem peluncur server lintas-platform (*cross-platform Node.js server launcher*) yang membaca konfigurasi port langsung dari berkas environment variables (`.env`, `.env.local`, atau `.env.production`) tanpa perlu mengubah kode sumber.

### 1. Mengubah Port Aplikasi

Cukup buka berkas `.env` atau `.env.local`, lalu ubah variabel `PORT` ke port yang Anda inginkan (misalnya `3000`, `4000`, `8080`):

```env
# ------------------------------------------------------------------------------
# KONFIGURASI SERVER & PORT
# ------------------------------------------------------------------------------
# Port listening server Next.js (default: 3000)
PORT=4000

# Hostname listening (0.0.0.0 agar dapat diakses dari jaringan lokal/LAN)
HOSTNAME=0.0.0.0

# URL Utama Aplikasi untuk Browser
NEXT_PUBLIC_APP_URL=http://localhost:4000
```

> **Catatan Cerdas:** Jika Anda hanya mengubah `PORT=4000` di berkas `.env` dan membiarkan `NEXT_PUBLIC_APP_URL` mengarah ke `http://localhost:3000`, sistem peluncur MusicFY akan secara otomatis menyinkronkan nomor port publik menjadi `http://localhost:4000`.

---

### 2. Menjalankan Aplikasi

#### Mode Development:
```bash
npm run dev
```

#### Mode Production:
```bash
npm run build
npm run start
```

#### Menjalankan Port Dinamis via Terminal (Ad-hoc):
Anda juga dapat mengubah port secara langsung melalui terminal tanpa mengubah file `.env`:

* **Linux / macOS:**
  ```bash
  PORT=5000 npm run dev
  ```
* **Windows (Command Prompt / CMD):**
  ```cmd
  set PORT=5000 && npm run dev
  ```
* **Windows (PowerShell):**
  ```powershell
  $env:PORT="5000"; npm run dev
  ```

---

## 🛡️ Validasi Port & Deteksi Konflik

Sistem peluncur server `scripts/run-server.js` menerapkan perlindungan komprehensif:

1. **Validasi Tipe & Rentang Port:**
   * Nilai `PORT` wajib berupa bilangan bulat (*integer*) antara **1** sampai **65535**.
   * Jika tidak valid (misal `PORT=abc` atau `PORT=99999`), server akan berhenti dengan pesan kesalahan yang jelas dan kode keluar `1`.
2. **Nilai Default Otomatis:**
   * Jika `PORT` tidak diatur, aplikasi otomatis menggunakan port standar **3000**.
3. **Deteksi Port Sedang Digunakan (Zero Silent Port Jumping):**
   * Jika port yang diminta sedang digunakan oleh proses lain (misal proses Node atau aplikasi lain), server **TIDAK AKAN** diam-diam berpindah port.
   * Server akan menampilkan peringatan:
     ```text
     [MusicFY Server Error] Port 3000 is already in use by another process.
     Please terminate the process running on port 3000 or set a different PORT in .env (e.g. PORT=4000).
     ```

---

## 🌐 Tabel Referensi Environment Variables

| Variabel | Default | Deskripsi |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port listening server Next.js (1 - 65535). |
| `HOSTNAME` | `0.0.0.0` | Hostname listening IP (`0.0.0.0` untuk semua network interface, atau `localhost`). |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:<PORT>` | URL publik utama aplikasi yang dapat diakses oleh browser/klien. |
| `NEXT_PUBLIC_BASE_URL` | *(Opsional)* | Alias fallback kompatibilitas domain publik untuk deployment VPS. |
| `MEILISEARCH_HOST` | `http://127.0.0.1:7700` | Host instance Meilisearch untuk pencarian super cepat (<50ms). |
| `GEMINI_API_KEY` | *(Opsional)* | Google Gemini AI Key untuk Natural Language Search & Lyrics Translation. |

---

## 💻 Kompatibilitas Lintas-Platform (Cross-Platform)

Peluncur server MusicFY dibangun menggunakan modul standar Node.js murni (`child_process`, `net`, `fs`, `path`) tanpa dependensi bash shell. Hal ini memastikan kompatibilitas penuh 100% pada:
- **Linux** (Ubuntu, Debian, Fedora, Arch)
- **macOS** (Apple Silicon M1/M2/M3 & Intel)
- **Windows** (Native CMD `cmd.exe`, PowerShell, WSL2, Git Bash)
- **Container & Process Manager** (Docker, Docker Compose, PM2, Systemd)

---

## 🚀 Perintah Perawatan & Build

```bash
# Cek validasi tipe TypeScript
npx tsc --noEmit

# Jalankan linter ESLint
npm run lint

# Kompilasi rilis produksi Next.js
npm run build

# Sinkronisasi aset mobile Capacitor Android
npm run cap:sync

# Build Android APK rilis mandiri
npm run build:apk
```
