# Panduan Lengkap Deployment TWA (Bubblewrap) & Pengaturan Android Latar Belakang MusicFY

Aplikasi **MusicFY** telah dikonfigurasi penuh untuk mendukung **Trusted Web Activity (TWA)** menggunakan Google Bubblewrap. Karena aplikasi berbasis web langsung pada domain `https://shanz.my.id`, **setiap pembaruan kode yang di-push ke GitHub dan di-deploy ke VPS Ubuntu akan langsung otomatis terperbarui di dalam aplikasi APK pengguna** tanpa perlu melakukan build atau instalasi ulang file APK.

---

## 1. Keunggulan Arsitektur TWA (Live Web Wrapper)
- **Zero-Rebuild Updates**: Perubahan tampilan, fitur baru, perbaikan bug lirik, dan logika streaming langsung aktif secara instan pada aplikasi pengguna saat server VPS diperbarui.
- **Ukuran APK Sangat Kecil (< 3-5 MB)**: Karena mesin rendering menggunakan Google Chrome/Chromium bawaan Android yang terisolasi aman.
- **Tampilan 100% Native (Tanpa URL Bar)**: Melalui verifikasi Digital Asset Links (`/.well-known/assetlinks.json`), aplikasi berjalan penuh layar (fullscreen standalone) persis seperti aplikasi native murni.

---

## 2. Persyaratan Digital Asset Links (`assetlinks.json`)

Agar aplikasi tidak menampilkan address bar Chrome, berkas berikut telah disediakan di:
`public/.well-known/assetlinks.json`

Format berkas:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.musicfy.app",
      "sha256_cert_fingerprints": [
        "14:6D:E9:7F:0F:52:EA:CB:5C:30:E4:E1:D9:8F:D6:75:5E:2B:6F:4D:43:2F:38:39:19:D9:46:7E:27:0B:4D:69"
      ]
    }
  }
]
```

> **Catatan Penggantian SHA-256:**
> Ganti nilai `sha256_cert_fingerprints` di atas dengan SHA-256 dari keystore rilis Anda jika menggunakan signing key kustom:
> ```bash
> keytool -list -v -keystore android.keystore -alias musicfy
> ```

---

## 3. Cara Membangun APK Menggunakan Bubblewrap (Langkah Cepat)

Di terminal komputer lokal atau server CI/CD:

```bash
# 1. Pastikan Node.js 18+ dan Java JDK 17+ terpasang
node -v
javac -version

# 2. Jalankan skrip build otomatis MusicFY
bash scripts/build-twa.sh
```

Atau menggunakan perintah langsung:
```bash
npx @bubblewrap/cli build
```

Berkas output `.apk` siap dipasang langsung ke HP atau diunggah ke server unduhan `https://shanz.my.id/install-apk`.

---

## 4. Penanganan Izin Latar Belakang & Anti Battery Killer (Gaming Mode)

Sistem operasi seperti **MIUI (Xiaomi), ColorOS (OPPO/Realme), OneUI (Samsung), dan FuntouchOS (Vivo)** memiliki fitur agresif penghemat baterai yang dapat mematikan proses browser atau aplikasi musik di latar belakang setelah beberapa menit, terutama saat pengguna membuka game berat (Mobile Legends, PUBG, Genshin Impact).

Berikut konfigurasi yang telah diintegrasikan pada MusicFY:

### A. Izin di AndroidManifest.xml (TWA & Android Wrapper)
```xml
<!-- Mengizinkan pemutaran audio di latar belakang -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### B. Meminta Pengecualian Penghemat Baterai (Request Ignore Battery Optimizations)
Frontend MusicFY telah menyediakan fungsi `requestBatteryExemption()` di `lib/backgroundService.ts`. Pada Android, perintah ini membuka popup sistem resmi agar pengguna mengecualikan MusicFY dari optimasi baterai:

```ts
import { requestBatteryExemption } from '@/lib/backgroundService';

// Dipanggil otomatis atau melalui menu pengaturan/notifikasi
await requestBatteryExemption();
```

Di tingkat Android native (`MediaSessionBridge.java`), fungsi ini memicu intent:
```java
Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
intent.setData(Uri.parse("package:" + activity.getPackageName()));
activity.startActivity(intent);
```

### C. Panduan Pengaturan Manual di HP Pengguna
Jika sistem HP sangat agresif:
1. **Kunci Aplikasi di Recent Apps**: Buka daftar aplikasi berjalan, tahan ikon MusicFY, lalu pilih ikon **Gembok (Lock)**.
2. **Penghemat Baterai Aplikasi**: Masuk ke **Pengaturan HP > Aplikasi > Kelola Aplikasi > MusicFY > Penghemat Baterai**, pilih **Tidak Ada Pembatasan (No Restrictions)**.
3. **Mulai Otomatis (Autostart)**: Aktifkan izin **Mulai Otomatis** agar notifikasi pemutar media tetap hidup ketika berpindah game atau memori RAM penuh.
