# Multi-stage Dockerfile for Next.js ACSRAG Standalone Production Build
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the standalone application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Production container runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create public dir and copy documents
RUN mkdir -p public
COPY --from=builder /app/documents ./documents

# Set up runtime cache directory
RUN mkdir -p .next && chown nextjs:nodejs .next

# Copy standalone output bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Health check probe against /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3   CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
