#!/usr/bin/env node

/**
 * Safe Build Runner for MusicFY
 * 
 * Guarantees that `npm run build` never runs concurrently with an active
 * development or production server, preventing .next manifest and Webpack
 * packfile cache corruption.
 */

const path = require('path');
const { spawn } = require('child_process');
const { getActiveLock } = require('./process-lock');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isForce = args.includes('--force') || args.includes('-f');
const cleanArgs = args.filter((a) => a !== '--force' && a !== '-f');

const activeLock = getActiveLock();

if (activeLock && !isForce) {
  console.error('\n\x1b[31m============================================================\x1b[0m');
  console.error('\x1b[31m[MusicFY Build Error] Active Server Detected!\x1b[0m');
  console.error('------------------------------------------------------------');
  console.error(`  • Running PID : \x1b[33m${activeLock.pid}\x1b[0m`);
  console.error(`  • Mode        : \x1b[33m${activeLock.mode}\x1b[0m`);
  console.error(`  • Port        : \x1b[33m${activeLock.port}\x1b[0m`);
  console.error('\nRunning a production build while a server is active will overwrite');
  console.error('.next, corrupting active Webpack packfiles and causing HTTP 500 errors.');
  console.error('\n\x1b[1mAction Required:\x1b[0m');
  console.error('  1. Stop the running server (PID: ' + activeLock.pid + ').');
  console.error('  2. Then run: \x1b[32mnpm run build\x1b[0m');
  console.error('  (Or override with: \x1b[33mnpm run build -- --force\x1b[0m)');
  console.error('\x1b[31m============================================================\x1b[0m\n');
  process.exit(1);
}

// Resolve next binary
let nextBin;
try {
  nextBin = require.resolve('next/dist/bin/next', { paths: [rootDir] });
} catch {
  nextBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
}

const child = spawn(process.execPath, [nextBin, 'build', ...cleanArgs], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

child.on('error', (err) => {
  console.error('[MusicFY Build] Failed to spawn build process:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
