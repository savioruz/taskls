# Stage 1: Build the SvelteKit application
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package and lock files
COPY package.json bun.lockb* ./

# Install dependencies using Bun
RUN bun install --frozen-lockfile

# Copy application source code
COPY . .

# Run production build
RUN bun run build

# Stage 2: Production runtime environment
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Copy SvelteKit Node server build, package info, and node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

# Ensure persistence directory for local JSON storage exists
RUN mkdir -p data

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start SvelteKit built standalone server with Bun
CMD ["bun", "build/index.js"]
