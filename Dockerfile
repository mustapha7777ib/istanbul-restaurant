# Production image: server.ts (Next.js + Socket.io + escalation ticker) in one process.
# Deployed by Render (render.yaml); runs on any Docker host.
FROM node:22-bookworm-slim

# Prisma's migration engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.17.1

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` loads route modules, which create the Prisma client; it never connects.
RUN DATABASE_URL=postgresql://build@localhost:5432/build pnpm build \
  && chown -R node:node .next

ENV NODE_ENV=production
USER node
EXPOSE 3000

# Render sets PORT and RENDER_EXTERNAL_URL; APP_URL (custom domain) wins when set.
# Migrations need Neon's direct connection (advisory locks don't work through the pooler).
CMD ["sh", "-c", "export APP_URL=\"${APP_URL:-$RENDER_EXTERNAL_URL}\" && DATABASE_URL=\"${DATABASE_URL_UNPOOLED:-$DATABASE_URL}\" ./node_modules/.bin/prisma migrate deploy && exec ./node_modules/.bin/tsx server.ts"]
