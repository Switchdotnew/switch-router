FROM oven/bun:latest-alpine AS base

# Set production environment
ENV NODE_ENV=production

# Update Alpine packages to fix CVEs
RUN apk update && apk upgrade && \
    apk add --no-cache musl>=1.2.5-r1 openssl>=3.3.3-r0

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:latest-alpine AS production

# Set production environment
ENV NODE_ENV=production

# Update Alpine packages to fix CVEs and install curl for health checks
RUN apk update && apk upgrade && \
    apk add --no-cache musl>=1.2.5-r1 openssl>=3.3.3-r0 curl

WORKDIR /app

# Copy built application
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Use existing bun user from base image
USER bun

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://0.0.0.0:3000/health || exit 1

# Start the application
CMD ["bun", "run", "start"]