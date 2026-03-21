import type { ServerWebSocket } from 'bun'
import type { ClientMessage, ServerMessage } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { MessageRouter } from './message-router'

export interface SocketData {
  playerId: string
}

interface RateLimit {
  count: number
  resetAt: number
}

export class SocketHandler {
  private router: MessageRouter
  connections: Map<string, ServerWebSocket<SocketData>> = new Map()
  private rateLimits: Map<string, RateLimit> = new Map()
  server: ReturnType<typeof Bun.serve> | null = null

  constructor(private manager: RoomManager) {
    this.router = new MessageRouter(manager)
  }

  open(ws: ServerWebSocket<SocketData>): void {
    const { playerId } = ws.data
    this.connections.set(playerId, ws)
    console.log(`[WS] Player connected: ${playerId}`)
  }

  message(ws: ServerWebSocket<SocketData>, raw: string | Buffer): void {
    const { playerId } = ws.data

    // Per-connection rate limiting: max 20 messages per second
    const now = Date.now()
    const limit = this.rateLimits.get(playerId) ?? { count: 0, resetAt: now + 1000 }
    if (now > limit.resetAt) {
      limit.count = 0
      limit.resetAt = now + 1000
    }
    limit.count++
    this.rateLimits.set(playerId, limit)
    if (limit.count > 20) {
      ws.send(
        JSON.stringify({
          type: 'error',
          code: 'RATE_LIMITED',
          message: 'Too many messages.',
        } satisfies ServerMessage),
      )
      return
    }

    let parsed: ClientMessage
    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          code: 'INVALID_JSON',
          message: 'Could not parse message as JSON.',
        } satisfies ServerMessage),
      )
      return
    }

    this.router.route(playerId, parsed, (response: ServerMessage) => {
      ws.send(JSON.stringify(response))

      // After a successful create_room or join_room, subscribe to the room topic
      if (response.type === 'room_created' || response.type === 'room_joined') {
        const roomId = response.roomId
        ws.subscribe(`room:${roomId}`)
        // Broadcast updated room state to all players in the room
        const room = this.manager.getRoom(roomId)
        if (room) {
          this.broadcast(roomId, { type: 'room_state', room }, playerId)
        }
      }
    })
  }

  close(ws: ServerWebSocket<SocketData>, code: number, reason: string): void {
    const { playerId } = ws.data
    console.log(`[WS] Player disconnected: ${playerId} (${code})`)

    const roomId = this.manager.playerRoomMap.get(playerId)
    if (roomId) {
      const result = this.manager.leaveRoom(roomId, playerId)
      this.manager.playerRoomMap.delete(playerId)
      if (result.room) {
        this.broadcast(roomId, { type: 'player_left', playerId })
        this.broadcast(roomId, { type: 'room_state', room: result.room })
      }
    }

    this.connections.delete(playerId)
    this.rateLimits.delete(playerId)
  }

  error(ws: ServerWebSocket<SocketData>, error: Error): void {
    console.error(`[WS] Error for player ${ws.data.playerId}:`, error)
  }

  /**
   * Broadcast a message to all connected players in a room.
   * If excludePlayerId is provided, skip that player.
   */
  broadcast(roomId: string, message: ServerMessage, excludePlayerId?: string): void {
    const data = JSON.stringify(message)
    if (excludePlayerId) {
      this.connections.forEach((wsHandle, pid) => {
        if (pid !== excludePlayerId) {
          wsHandle.send(data)
        }
      })
    } else if (this.server) {
      this.server.publish(`room:${roomId}`, data)
    }
  }
}
