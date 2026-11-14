#!/usr/bin/env node

/**
 * Safe Clean Script for MusicFY
 * 
 * Prevents catastrophic runtime failure caused by deleting .next while
 * a development server or production server is actively running.
 */

const fs = require('fs');
const path = require('path');
const { getActiveLock } = require('./process-lock');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isForce = args.includes('--force') || args.includes('-f');

const activeLock = getActiveLock();

if (activeLock && !isForce) {
  console.error('\n\x1b[31m============================================================\x1b[0m');
  console.error('\x1b[31m[MusicFY Clean Error] Active Server Detected!\x1b[0m');
  console.error('------------------------------------------------------------');
  console.error(`  • PID       : \x1b[33m${activeLock.pid}\x1b[0m`);
  console.error(`  • Mode      : \x1b[33m${activeLock.mode}\x1b[0m`);
  console.error(`  • Port      : \x1b[33m${activeLock.port}\x1b[0m`);
  console.error('\nDeleting .next while a server is running destroys runtime');
  console.error('manifests and causes HTTP 500 & Webpack PackFileCache errors.');
  console.error('\n\x1b[1mAction Required:\x1b[0m');
  console.error('  1. Stop the running server first.');
  console.error('  2. Then run: \x1b[32mnpm run clean\x1b[0m');
  console.error('  (Or override with: \x1b[33mnpm run clean -- --force\x1b[0m)');
  console.error('\x1b[31m============================================================\x1b[0m\n');
  process.exit(1);
}

// Perform safe cleanup
const targets = [
  path.join(rootDir, '.next'),
  path.join(rootDir, 'tsconfig.tsbuildinfo'),
  path.join(rootDir, '.musicfy.lock'),
];

let cleanedCount = 0;
for (const target of targets) {
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      cleanedCount++;
    } catch (err) {
      console.warn(`[MusicFY Clean] Warning removing ${path.basename(target)}:`, err.message);
    }
  }
}

console.log('\n\x1b[32m[MusicFY Clean] ✓ Successfully cleaned build artifacts and temporary cache.\x1b[0m\n');
