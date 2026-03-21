import { Hono } from 'hono'
import { RoomManager } from './lobby'
import { SocketHandler } from './net/socket-handler'
import type { SocketData } from './net/socket-handler'
import type { ServerWebSocket } from 'bun'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())

const manager = new RoomManager()
const socketHandler = new SocketHandler(manager)

const app = new Hono()

// Health check endpoint
app.get('/', (c) => c.json({ status: 'ok', service: 'heist-server' }))

app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

// Upgrade HTTP connections to WebSocket
app.get('/ws', (c) => {
  const origin = c.req.header('origin') ?? ''
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return c.text('Forbidden', 403)
  }

  const server = (c.env as { server?: ReturnType<typeof Bun.serve> }).server
  const upgraded = server?.upgrade(c.req.raw, {
    data: {
      playerId: crypto.randomUUID(),
    } satisfies SocketData,
  })

  if (!upgraded) {
    return c.text('WebSocket upgrade failed', 400)
  }

  // Bun handles the response after upgrade
  return new Response(null, { status: 101 })
})

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    // Handle WebSocket upgrade
    if (url.pathname === '/ws') {
      const origin = req.headers.get('origin') ?? ''
      if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
        return new Response('Forbidden', { status: 403 })
      }

      const upgraded = server.upgrade(req, {
        data: {
          playerId: crypto.randomUUID(),
        } satisfies SocketData,
      })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // Pass all other requests to Hono
    return app.fetch(req, { server })
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      socketHandler.open(ws)
      // Subscribe to a room-specific topic for broadcasting
      // (room subscriptions happen after create/join)
    },
    message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
      socketHandler.message(ws, message)
    },
    close(ws: ServerWebSocket<SocketData>, code: number, reason: string) {
      socketHandler.close(ws, code, reason)
    },
  },
})

// Wire up the server reference so broadcast can use server.publish()
socketHandler.server = server

console.log(`[Heist Server] Listening on http://localhost:${PORT}`)
console.log(`[Heist Server] WebSocket endpoint: ws://localhost:${PORT}/ws`)
