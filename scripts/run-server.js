#!/usr/bin/env node

/**
 * Cross-Platform Dynamic Server Launcher for MusicFY
 *
 * Guarantees:
 * 1. 100% Cross-Platform compatibility (Windows cmd/PowerShell, Linux, macOS).
 * 2. Parses .env, .env.development, .env.production, and .env.local without external dependencies.
 * 3. Strict port validation: integer between 1 and 65535, defaults to 3000.
 * 4. Conflict detection: fails immediately with clear error if port is already in use (never silently switches ports).
 * 5. Launches Next.js with validated -H <HOSTNAME> and -p <PORT>.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { acquireLock, releaseLock } = require('./process-lock');

const rootDir = path.resolve(__dirname, '..');

/**
 * Lightweight zero-dependency .env parser.
 * Preserves quotes, strips comments, ignores empty lines.
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = {};
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch (err) {
    console.warn(`[MusicFY Server] Warning: Could not read ${filePath}:`, err.message);
    return {};
  }
}

/**
 * Loads environment variables following Next.js precedence:
 * 1. process.env (system environment / CLI overrides)
 * 2. .env.local
 * 3. .env.development or .env.production (based on mode)
 * 4. .env
 */
function loadEnvironment(mode) {
  const envFiles = [
    path.join(rootDir, '.env.local'),
    mode === 'dev' ? path.join(rootDir, '.env.development') : path.join(rootDir, '.env.production'),
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.example'),
  ];

  for (const file of envFiles) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Tests if the given port is available for listening on the given host.
 */
function checkPortAvailable(port, host) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use by another process.`));
      } else if (err.code === 'EACCES') {
        reject(new Error(`Permission denied to bind to port ${port}. Ports below 1024 typically require administrative/root privileges.`));
      } else {
        reject(err);
      }
    });

    tester.once('listening', () => {
      tester.close(() => resolve());
    });

    tester.listen(port, host === '0.0.0.0' ? undefined : host);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] === 'start' ? 'start' : 'dev';
  const extraArgs = args.filter((arg, idx) => idx > 0);

  // 1. Set appropriate NODE_ENV based on execution mode
  process.env.NODE_ENV = mode === 'start' ? 'production' : 'development';

  // 2. Load environment configuration
  loadEnvironment(mode);

  // 3. Validate PORT
  const rawPort = process.env.PORT;
  let port = 3000;
  if (rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== '') {
    const num = Number(rawPort);
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      console.error('\n\x1b[31m============================================================\x1b[0m');
      console.error(`\x1b[31m[MusicFY Server Error] Invalid PORT "${rawPort}"\x1b[0m`);
      console.error('PORT must be an integer between 1 and 65535.');
      console.error('Example: PORT=3000 or PORT=4000 in your .env file.');
      console.error('\x1b[31m============================================================\x1b[0m\n');
      process.exit(1);
    }
    port = num;
  }

  // 3. Resolve HOSTNAME
  const hostname = process.env.HOSTNAME || '0.0.0.0';

  // 4. Check port availability (Fail fast if in use - no silent port jumping)
  try {
    await checkPortAvailable(port, hostname);
  } catch (err) {
    console.error('\n\x1b[31m============================================================\x1b[0m');
    console.error(`\x1b[31m[MusicFY Server Error] ${err.message}\x1b[0m`);
    console.error(`Please terminate the process running on port ${port} or set a different PORT in .env (e.g. PORT=4000).`);
    console.error('\x1b[31m============================================================\x1b[0m\n');
    process.exit(1);
  }

  // 5. Synchronize Environment Variables for Next.js & Client
  process.env.PORT = String(port);
  process.env.HOSTNAME = hostname;

  let appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!appUrl) {
    const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname;
    appUrl = `http://${displayHost}:${port}`;
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
  } else {
    // If NEXT_PUBLIC_APP_URL points to localhost/127.0.0.1, synchronize port with active PORT
    try {
      const parsedUrl = new URL(appUrl);
      if (
        (parsedUrl.hostname === 'localhost' ||
          parsedUrl.hostname === '127.0.0.1' ||
          parsedUrl.hostname === '0.0.0.0') &&
        parsedUrl.port !== String(port)
      ) {
        parsedUrl.port = String(port);
        appUrl = parsedUrl.toString().replace(/\/+$/, '');
        process.env.NEXT_PUBLIC_APP_URL = appUrl;
      }
    } catch {}
  }

  // 6. Project Lock Guard (Prevents concurrent Next.js processes from corrupting .next)
  const lockResult = acquireLock(mode, port, appUrl);
  if (!lockResult.success) {
    const existing = lockResult.existing;
    console.error('\n\x1b[31m============================================================\x1b[0m');
    console.error('\x1b[31m[MusicFY Server Error] Another Next.js Server is Already Running!\x1b[0m');
    console.error('------------------------------------------------------------');
    console.error(`  • Running PID : \x1b[33m${existing.pid}\x1b[0m`);
    console.error(`  • Mode        : \x1b[33m${existing.mode}\x1b[0m`);
    console.error(`  • Port        : \x1b[33m${existing.port}\x1b[0m`);
    console.error(`  • App URL     : \x1b[33m${existing.appUrl || 'N/A'}\x1b[0m`);
    console.error('\nRunning multiple Next.js servers concurrently on the same directory');
    console.error('causes Webpack cache file collisions, missing manifests, and HTTP 500 errors.');
    console.error('\n\x1b[1mAction Required:\x1b[0m');
    console.error(`  Please terminate the existing server (PID: ${existing.pid}) before starting a new one.`);
    console.error('\x1b[31m============================================================\x1b[0m\n');
    process.exit(1);
  }

  // 7. Display Clean Startup Info
  const modeLabel = mode === 'dev' ? 'Development' : 'Production';
  console.log('\n\x1b[32m============================================================\x1b[0m');
  console.log(`\x1b[1m  MusicFY Next.js Server (${modeLabel})\x1b[0m`);
  console.log('------------------------------------------------------------');
  console.log(`  • Port     : \x1b[36m${port}\x1b[0m`);
  console.log(`  • Hostname : \x1b[36m${hostname}\x1b[0m`);
  console.log(`  • App URL  : \x1b[32m${appUrl}\x1b[0m`);
  console.log('\x1b[32m============================================================\x1b[0m\n');

  // 7. Determine Execution Script & Arguments
  let execScript;
  let execArgs;
  const standaloneServer = path.join(rootDir, '.next', 'standalone', 'server.js');

  if (mode === 'start' && fs.existsSync(standaloneServer)) {
    // Next.js standalone server requires .next/static and public inside .next/standalone
    try {
      const standaloneStaticDir = path.join(rootDir, '.next', 'standalone', '.next', 'static');
      const rootStaticDir = path.join(rootDir, '.next', 'static');
      if (fs.existsSync(rootStaticDir)) {
        if (!fs.existsSync(path.dirname(standaloneStaticDir))) {
          fs.mkdirSync(path.dirname(standaloneStaticDir), { recursive: true });
        }
        fs.cpSync(rootStaticDir, standaloneStaticDir, { recursive: true });
      }
      const standalonePublicDir = path.join(rootDir, '.next', 'standalone', 'public');
      const rootPublicDir = path.join(rootDir, 'public');
      if (fs.existsSync(rootPublicDir)) {
        fs.cpSync(rootPublicDir, standalonePublicDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[MusicFY Server] Warning: Could not sync standalone assets:', err.message);
    }

    execScript = standaloneServer;
    execArgs = [...extraArgs];
  } else {
    try {
      execScript = require.resolve('next/dist/bin/next', { paths: [rootDir] });
    } catch {
      execScript = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
    }
    execArgs = [mode, '-H', hostname, '-p', String(port), ...extraArgs];
  }

  // 8. Launch Server Process
  const child = spawn(process.execPath, [execScript, ...execArgs], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: hostname,
      NODE_ENV: mode === 'start' ? 'production' : 'development',
    },
  });

  child.on('error', (err) => {
    console.error('[MusicFY Server] Failed to spawn Next.js process:', err);
    releaseLock();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    releaseLock();
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  // Graceful shutdown forwarding
  process.on('SIGINT', () => {
    releaseLock();
    child.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    releaseLock();
    child.kill('SIGTERM');
  });
}

main().catch((err) => {
  console.error('[MusicFY Server] Unexpected fatal error:', err);
  process.exit(1);
});
