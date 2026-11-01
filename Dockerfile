# syntax=docker/dockerfile:1

# Universal Linux container for Download Anything.
# Works on: Hugging Face Spaces (Docker SDK), Render, Fly.io, Koyeb, any VPS.
#
# Build/run locally:
#   docker build -t download-anything .
#   docker run -p 7860:7860 download-anything
# Server.js auto-downloads the Linux yt-dlp + FFmpeg binaries on first boot.

# ---------- Stage 1: build the web app ----------
FROM node:22-slim AS webbuild
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build:web

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils tar \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/server/package.json apps/server/package.json
COPY apps/server/server.js apps/server/server.js
COPY package.json package-lock.json ./
RUN npm ci --workspace=@da/server --omit=dev --no-audit --no-fund
COPY --from=webbuild /app/apps/web/dist apps/web/dist

ENV PORT=7860
EXPOSE 7860

# Writable temp for in-flight downloads inside containers
ENV TMPDIR=/tmp
CMD ["node", "apps/server/server.js"]
