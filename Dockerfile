# ==============================================================================
# Production Dockerfile for MusicFY on Ubuntu VPS
# Multi-stage build with Node.js 20, Python 3, ffmpeg, and latest yt-dlp
# Supports dynamic multi-cookie rotation (cookies.txt, cookies1.txt, cookies2.txt, etc.)
# ==============================================================================

# Stage 1: Dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Set build-time dummy env if needed
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build

# Stage 3: Runner
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NEXT_TELEMETRY_DISABLED=1

# Install runtime system packages: Python 3, ffmpeg, ca-certificates, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Copy production artifacts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/ecosystem.config.cjs ./ecosystem.config.cjs

# Create logs directory
RUN mkdir -p /app/logs /app/storage

# Expose HTTP port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/suggest?q=test || exit 1

# Start production server
CMD ["node", "scripts/run-server.js", "start"]
