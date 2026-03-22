import type { ServerWebSocket } from 'bun'
import type { ClientMessage, ServerMessage } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { MessageRouter } from './message-router'
import { GameSessionManager } from '../game/session-manager'

export interface SocketData {
  playerId: string
}

interface RateLimit {
  count: number
  resetAt: number
}

export class SocketHandler {
  private router: MessageRouter
  private sessions: GameSessionManager
  connections: Map<string, ServerWebSocket<SocketData>> = new Map()
  private rateLimits: Map<string, RateLimit> = new Map()
  server: ReturnType<typeof Bun.serve> | null = null

  constructor(private manager: RoomManager) {
    this.router = new MessageRouter(manager, (roomId, msg) =>
      this.broadcastToThieves(roomId, msg),
    )
    this.sessions = new GameSessionManager(manager, (roomId, msg) =>
      this.broadcast(roomId, msg),
    )
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

      // After create_room or join_room, subscribe and push room_state to all members
      if (response.type === 'room_created' || response.type === 'room_joined') {
        const roomId = response.roomId
        ws.subscribe(`room:${roomId}`)
        this.broadcastRoomState(roomId)
      }

      // After a state-mutating action (role/ready), push updated state to other room members
      if (response.type === 'room_state') {
        const roomId = this.manager.playerRoomMap.get(playerId)
        if (roomId) {
          this.broadcastRoomState(roomId, playerId)
          // Kick off planning phase if the room just transitioned
          const room = this.manager.getRoom(roomId)
          if (room?.phase === 'planning') {
            this.sessions.startPlanning(roomId)
          }
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
        this.broadcastRoomState(roomId)
        this.broadcast(roomId, { type: 'player_left', playerId })
      } else {
        // Room was cleaned up — stop the game session if running
        this.sessions.stopRoom(roomId)
      }
    }

    this.connections.delete(playerId)
    this.rateLimits.delete(playerId)
  }

  error(ws: ServerWebSocket<SocketData>, error: Error): void {
    console.error(`[WS] Error for player ${ws.data.playerId}:`, error)
  }

  /**
   * Broadcast a message to all subscribers of a room topic.
   */
  broadcast(roomId: string, message: ServerMessage): void {
    if (this.server) {
      this.server.publish(`room:${roomId}`, JSON.stringify(message))
    }
  }

  /**
   * Broadcast a message to all thieves in a room (excludes security).
   */
  private broadcastToThieves(roomId: string, message: ServerMessage): void {
    const room = this.manager.getRoom(roomId)
    if (!room) return
    const msg = JSON.stringify(message)
    for (const player of room.players) {
      if (player.role === 'thief') {
        this.connections.get(player.id)?.send(msg)
      }
    }
  }

  /**
   * Send room_state to every player currently in the room.
   * If excludePlayerId is set, skip that player (they already received it via respond()).
   */
  private broadcastRoomState(roomId: string, excludePlayerId?: string): void {
    const room = this.manager.getRoom(roomId)
    if (!room) return
    const msg = JSON.stringify({ type: 'room_state', room } satisfies ServerMessage)
    for (const player of room.players) {
      if (player.id === excludePlayerId) continue
      this.connections.get(player.id)?.send(msg)
    }
  }
}
