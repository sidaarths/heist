FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lockb ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN bun install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

RUN cd packages/shared && bun run build
RUN cd packages/server && bun run build 2>/dev/null || true

EXPOSE 3001
CMD ["bun", "run", "packages/server/src/index.ts"]
