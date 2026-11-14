const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const lockFilePath = path.join(rootDir, '.musicfy.lock');

/**
 * Validates whether a process with the given PID is actively running.
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    return false;
  }

  // Extra verification on Linux/Unix systems to check if it's actually a Node/Next process
  if (process.platform !== 'win32') {
    try {
      const cmdlinePath = `/proc/${pid}/cmdline`;
      if (fs.existsSync(cmdlinePath)) {
        const cmdline = fs.readFileSync(cmdlinePath, 'utf8');
        return /node|next|musicfy/i.test(cmdline);
      }
    } catch {
      // If /proc cannot be inspected (e.g. permission or macOS), process.kill(pid, 0) was already true
      return true;
    }
  }

  return true;
}

/**
 * Reads and returns active lock information, or null if no valid lock is held.
 * Automatically cleans up stale locks left behind by ungraceful crashes (kill -9).
 */
function getActiveLock() {
  if (!fs.existsSync(lockFilePath)) return null;

  try {
    const raw = fs.readFileSync(lockFilePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !data.pid) {
      fs.unlinkSync(lockFilePath);
      return null;
    }

    if (isProcessAlive(data.pid)) {
      return data;
    }

    // Process is no longer alive - stale lockfile recovery
    try {
      fs.unlinkSync(lockFilePath);
    } catch {}
    return null;
  } catch {
    try {
      fs.unlinkSync(lockFilePath);
    } catch {}
    return null;
  }
}

/**
 * Attempts to acquire an exclusive lock for the current process.
 */
function acquireLock(mode, port, appUrl) {
  const existing = getActiveLock();
  if (existing && existing.pid !== process.pid) {
    return { success: false, existing };
  }

  const lockData = {
    pid: process.pid,
    mode,
    port,
    appUrl,
    startTime: Date.now(),
  };

  try {
    fs.writeFileSync(lockFilePath, JSON.stringify(lockData, null, 2), 'utf8');
  } catch (err) {
    console.warn('[ProcessLock] Warning: Could not write lockfile:', err.message);
  }

  // Register automatic cleanup hooks
  const cleanup = () => {
    try {
      if (fs.existsSync(lockFilePath)) {
        const current = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
        if (current.pid === process.pid) {
          fs.unlinkSync(lockFilePath);
        }
      }
    } catch {}
  };

  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  return { success: true };
}

/**
 * Releases the lock if held by this process.
 */
function releaseLock() {
  try {
    if (fs.existsSync(lockFilePath)) {
      const current = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
      if (current.pid === process.pid) {
        fs.unlinkSync(lockFilePath);
      }
    }
  } catch {}
}

module.exports = {
  isProcessAlive,
  getActiveLock,
  acquireLock,
  releaseLock,
  lockFilePath,
};
