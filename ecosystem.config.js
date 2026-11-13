const fs = require('fs');
const path = require('path');

/**
 * PM2 Ecosystem Configuration for MusicFY Production Deployment (High-Performance VPS Cluster Mode)
 * 
 * Supports:
 * - Next.js Standalone server in Cluster Mode (utilizes 100% of VPS CPU cores for maximum concurrency)
 * - Dynamic multi-cookie rotation for yt-dlp
 * - Automatic crash recovery and memory limit watchdog (1536MB per worker)
 * - Node.js max-old-space-size=2048 to prevent heap starvation under parallel streaming load
 * - Centralized log files with ISO timestamps
 */

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {}
}

const standaloneServer = path.join(__dirname, '.next', 'standalone', 'server.js');
const useStandalone = fs.existsSync(standaloneServer);

module.exports = {
  apps: [
    {
      name: 'musicfy-web',
      script: useStandalone ? '.next/standalone/server.js' : 'node_modules/next/dist/bin/next',
      args: useStandalone ? '' : 'start',
      cwd: './',
      instances: 'max', // Cluster mode utilizes all CPU cores of the VPS
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1536M',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
        HOSTNAME: '0.0.0.0',
        MAX_CONCURRENT_YTDLP: 16,
        COOKIE_ROTATION_BATCH_SIZE: 5,
        COOKIE_SELECTION_STRATEGY: 'rotate',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
