# Oceano ARW Conversion Worker
#
# Lightweight Node service that decodes Sony ARW (and other RAW formats) via
# LibRaw's dcraw_emu CLI, pipes through Sharp for color management + JPEG
# encoding, and uploads the result back to Supabase Storage.
#
# Runs on Fly.io's free tier (shared-cpu-1x, 256 MB RAM) for normal volume.
# For batch workloads, scale to the smallest paid tier ($2-5/mo).

FROM node:22-slim

# LibRaw provides dcraw_emu (full RAW decode for /convert).
# exiftool (libimage-exiftool-perl) extracts the embedded camera JPEG for the
# fast /preview path — this libraw-bin build of dcraw_emu doesn't support `-e`.
# We also install Sharp's native dependencies.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libraw-bin \
       libimage-exiftool-perl \
       libvips42 \
       ca-certificates \
       curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
