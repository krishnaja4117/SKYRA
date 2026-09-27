# SKYRA Backend Gateway — Dockerfile (Phase 16)
# Node 20 Alpine — production build

FROM node:20-alpine

WORKDIR /app

# Install production dependencies only.
# Copy lock file first for reproducible installs and Docker layer caching.
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# Copy application source (tests excluded via .dockerignore)
COPY src ./src

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Start the backend server directly — no shell wrapper needed
CMD ["node", "src/server.js"]
