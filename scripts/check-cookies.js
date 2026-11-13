#!/usr/bin/env node

/**
 * MusicFY - VPS yt-dlp Cookie Health Inspector & Diagnostic Tool
 * Usage:
 *   node scripts/check-cookies.js
 *   npm run cookies:status
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT_CANDIDATES = [
  process.env.PORT ? parseInt(process.env.PORT, 10) : null,
  7000,
  3000,
].filter((p) => p !== null && !isNaN(p));

function checkLiveServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/admin/cookie-health?format=text&color=1',
        timeout: 2000,
        headers: {
          'User-Agent': 'curl/7.88.1 (MusicFY-CLI)',
          Accept: 'text/plain',
        },
      },
      (res) => {
        if (res.statusCode === 200) {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ ok: true, data });
          });
        } else {
          resolve({ ok: false, status: res.statusCode });
        }
      }
    );

    req.on('error', () => {
      resolve({ ok: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

function runOfflineDiagnostics() {
  const rootDir = process.cwd();
  console.log('\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[36m║ 🍪  MUSICFY COOKIE DIAGNOSTICS (MODE INSPEKSI DISK LOKAL / OFFLINE)              ║\x1b[0m');
  console.log('\x1b[36m╠══════════════════════════════════════════════════════════════════════════════════╣\x1b[0m');
  console.log(`║ Direktori VPS  : ${rootDir}`.padEnd(83) + '║');
  console.log(`║ Waktu Cek      : ${new Date().toLocaleString('id-ID')}`.padEnd(83) + '║');
  console.log('║ Catatan        : Server Next.js sedang offline. Menampilkan hasil analisa disk.  ║');
  console.log('\x1b[36m╚══════════════════════════════════════════════════════════════════════════════════╝\x1b[0m\n');

  let entries = [];
  try {
    entries = fs.readdirSync(rootDir);
  } catch (err) {
    console.error('Gagal membaca direktori:', err.message);
    return;
  }

  const cookieFiles = entries.filter((e) => /^cookie.*\.txt$/i.test(e));

  if (cookieFiles.length === 0) {
    console.log('\x1b[33m⚠️  Tidak ditemukan berkas cookie (cookie*.txt) di direktori root VPS.\x1b[0m');
    console.log('   Saran: Upload berkas cookies.txt atau cookies1.txt untuk rotasi multi-akun.\n');
    return;
  }

  console.log('\x1b[1m┌─────────────────┬──────────┬─────────────────┬──────────────────────┬──────────────────────┐\x1b[0m');
  console.log('\x1b[1m│ BERKAS          │ UKURAN   │ HEADER NETSCAPE │ STATUS KUNCI LOGIN   │ MASA BERLAKU         │\x1b[0m');
  console.log('\x1b[1m├─────────────────┼──────────┼─────────────────┼──────────────────────┼──────────────────────┤\x1b[0m');

  const nowSec = Math.floor(Date.now() / 1000);

  for (const filename of cookieFiles) {
    const fullPath = path.join(rootDir, filename);
    try {
      const stat = fs.statSync(fullPath);
      const sizeStr = `${(stat.size / 1024).toFixed(1)} KB`;

      let hasNetscapeHeader = false;
      let hasYoutubeAuth = false;
      let earliestExpiry = Infinity;
      let latestExpiry = 0;

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# Netscape HTTP Cookie File') || trimmed.startsWith('# HTTP Cookie File')) {
          hasNetscapeHeader = true;
          continue;
        }
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split('\t');
        if (parts.length >= 7) {
          const domain = parts[0];
          const expiry = parseInt(parts[4], 10);
          const name = parts[5];

          if (domain.includes('youtube.com') || domain.includes('.google.com')) {
            if (['LOGIN_INFO', 'SID', '__Secure-3PSID', '__Secure-1PSID', 'SAPISID'].includes(name)) {
              hasYoutubeAuth = true;
              if (!isNaN(expiry) && expiry > 0) {
                if (expiry < earliestExpiry) earliestExpiry = expiry;
                if (expiry > latestExpiry) latestExpiry = expiry;
              }
            }
          }
        }
      }

      const headerStatus = hasNetscapeHeader
        ? '\x1b[32mVALID NETSCAPE\x1b[0m '
        : '\x1b[33mNON-STANDARD  \x1b[0m ';

      let authStatus = '\x1b[31mKOSONG / GUEST\x1b[0m';
      if (hasYoutubeAuth) {
        authStatus = '\x1b[32mTERAUTENTIKASI\x1b[0m';
      }

      let expiryNote = 'Tidak ada expiry';
      if (latestExpiry > 0) {
        if (latestExpiry < nowSec) {
          expiryNote = `\x1b[31mEXPIRED\x1b[0m (${new Date(latestExpiry * 1000).toLocaleDateString('id-ID')})`;
        } else {
          const daysLeft = Math.ceil((latestExpiry - nowSec) / 86400);
          expiryNote = `\x1b[32mAKTIF\x1b[0m (${daysLeft} hari lagi)`;
        }
      }

      const colFile = filename.padEnd(15).slice(0, 15);
      const colSize = sizeStr.padEnd(8).slice(0, 8);
      console.log(`│ ${colFile} │ ${colSize} │ ${headerStatus} │ ${authStatus.padEnd(29).slice(0, 29)} │ ${expiryNote.padEnd(30).slice(0, 30)} │`);
    } catch (e) {
      console.log(`│ ${filename.padEnd(15)} │ ERROR    │ Gagal membaca berkas: ${e.message}`);
    }
  }

  console.log('\x1b[1m└─────────────────┴──────────┴─────────────────┴──────────────────────┴──────────────────────┘\x1b[0m\n');

  // Check persistent log file
  const logFile = path.join(rootDir, 'logs', 'cookie-health.log');
  if (fs.existsSync(logFile)) {
    try {
      const logs = fs.readFileSync(logFile, 'utf8').trim().split('\n');
      const last5 = logs.filter((l) => l.trim()).slice(-5);
      if (last5.length > 0) {
        console.log('\x1b[1m🚨 5 CATATAN LOG PERINGATAN TERAKHIR (logs/cookie-health.log):\x1b[0m');
        for (const line of last5) {
          console.log(`   ${line}`);
        }
        console.log('');
      }
    } catch {}
  }
}

async function main() {
  for (const port of PORT_CANDIDATES) {
    const res = await checkLiveServer(port);
    if (res.ok && res.data) {
      console.log(res.data);
      return;
    }
  }

  // If server is not running on any candidates, run offline disk diagnosis
  runOfflineDiagnostics();
}

main().catch((err) => {
  console.error('Error saat menjalankan pemeriksaan cookie:', err);
});
