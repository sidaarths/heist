# Heist

A real-time multiplayer asymmetric party game for 3–5 players. One player is the **Security AI** with god-mode control of a building. The rest are **Thieves** trying to steal loot and escape — all from completely different interfaces rendered from the same shared game state.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Server | [Hono](https://hono.dev) + Bun WebSocket |
| Client | [Preact](https://preactjs.com) + [@preact/signals](https://preactjs.com/guide/v10/signals/) + Vite |
| Shared | TypeScript library |
| Deployment | Vercel (client) / Fly.io or Docker (server) |

## Repository Structure

```
heist/
├── packages/
│   ├── client/      # Preact frontend (Vite)
│   ├── server/      # Hono + Bun WebSocket server
│   └── shared/      # Shared types and game logic
├── Dockerfile       # Server container image
├── fly.toml         # Fly.io deployment config
├── vercel.json      # Vercel deployment config
└── design.md        # Full game design document
```

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.0

```bash
# Install dependencies
bun install

# Start development (server + client concurrently)
bun run dev
```

The server listens on `http://localhost:3001` and the client dev server on `http://localhost:5173`.

## Commands

<!-- AUTO-GENERATED -->
### Root (monorepo)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start server and client concurrently with hot reload |
| `bun run test` | Run all server and shared tests |
| `bun run typecheck` | TypeScript type check across all packages |

### Client (`packages/client`)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Production build |
| `bun run preview` | Preview production build locally |
| `bun run typecheck` | TypeScript type check |
| `bun run test` | Run unit tests |
| `bun run test:e2e` | Run Playwright E2E tests |
| `bun run test:e2e:ui` | Run E2E tests with Playwright UI |
| `bun run test:e2e:debug` | Run E2E tests in debug mode |
| `bun run test:e2e:report` | Show last Playwright HTML report |

### Server (`packages/server`)

| Command | Description |
|---------|-------------|
| `bun run dev` | Start server with hot reload (`--hot`) |
| `bun run start` | Start server |
| `bun run test` | Run tests |
| `bun run typecheck` | TypeScript type check |

### Shared (`packages/shared`)

| Command | Description |
|---------|-------------|
| `bun run build` | Build to `dist/` |
| `bun run typecheck` | TypeScript type check |
<!-- END AUTO-GENERATED -->

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server listen port |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | Comma-separated list of allowed WebSocket origins (supports `*.example.com` wildcards) |

## API

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check — returns `{ status: "ok", service: "heist-server" }` |
| `GET` | `/health` | Health check with uptime — returns `{ status: "ok", uptime: <seconds> }` |
| `GET` | `/ws` | WebSocket upgrade endpoint |

### WebSocket

Connect to `ws://localhost:3001/ws`. On connection, each client receives a unique `playerId` (UUID). All game communication — room creation, joining, game events — flows through this WebSocket connection.

## Game Overview

See [`design.md`](./design.md) for the full design document. In brief:

- **Security AI** (1 player): top-down view of the entire building; controls cameras, doors, alarms, lights, and guards
- **Thieves** (2–4 players): limited viewport showing only their immediate surroundings; coordinate via in-game text chat
- **Game flow:** Lobby → 5-minute Heist → Resolution → Replay
- **Thieves win** by collecting loot and escaping. **Security wins** by letting the timer expire.

## Deployment

### Docker (server)

```bash
docker build -t heist-server .
docker run -p 3001:3001 -e ALLOWED_ORIGINS=https://your-client.com heist-server
```

### Fly.io (server)

```bash
fly deploy
```

### Vercel (client)

The `vercel.json` config builds the client and serves `packages/client/dist`. Deploy via the Vercel dashboard or CLI.
