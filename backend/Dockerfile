# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app

# Prisma 6 needs OpenSSL; CA certificates are also used by Netease HTTPS calls.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build

COPY package.json package-lock.json ./
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY vendor ./vendor

# Generation does not connect to this placeholder database. Runtime credentials
# are supplied when the container starts, never during the image build.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    ./node_modules/.bin/prisma generate \
    && npm run build

FROM base AS runtime

ENV NODE_ENV=production \
    PORT=3001

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
# Keep the installed Prisma CLI so migrations can use this same image.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/vendor ./vendor

USER node

EXPOSE 3001

# Apply pending migrations before accepting requests; stop if migration fails.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node dist/server.js"]
