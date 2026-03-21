FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

RUN bun install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

RUN cd packages/shared && bun run build
# Bun runs TypeScript directly — no separate build step needed for server

EXPOSE 3001
CMD ["bun", "run", "packages/server/src/index.ts"]
