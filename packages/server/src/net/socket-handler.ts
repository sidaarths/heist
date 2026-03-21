import type { ServerWebSocket } from 'bun'
import type { ClientMessage, ServerMessage } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { MessageRouter } from './message-router'

export interface SocketData {
  playerId: string
}

export class SocketHandler {
  private router: MessageRouter

  constructor(private manager: RoomManager) {
    this.router = new MessageRouter(manager)
  }

  open(ws: ServerWebSocket<SocketData>): void {
    console.log(`[WS] Player connected: ${ws.data.playerId}`)
  }

  message(ws: ServerWebSocket<SocketData>, raw: string | Buffer): void {
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

    this.router.route(ws.data.playerId, parsed, (response: ServerMessage) => {
      ws.send(JSON.stringify(response))
    })
  }

  close(ws: ServerWebSocket<SocketData>, code: number, reason: string): void {
    const { playerId } = ws.data
    console.log(`[WS] Player disconnected: ${playerId} (${code})`)

    const room = this.manager.getRoomForPlayer(playerId)
    if (room) {
      // Mark player as disconnected (don't fully remove yet — allow reconnect)
      const player = room.players.find(p => p.id === playerId)
      if (player) {
        player.connected = false
      }
    }
  }

  error(ws: ServerWebSocket<SocketData>, error: Error): void {
    console.error(`[WS] Error for player ${ws.data.playerId}:`, error)
  }

  /**
   * Broadcast a message to all connected players in a room.
   */
  broadcast(
    roomId: string,
    message: ServerMessage,
    excludePlayerId?: string,
  ): void {
    // In Bun's WebSocket, we'd use ws.publish() with topics.
    // This method is a placeholder; actual broadcasting uses Bun topics.
    console.log(`[WS] Broadcast to room ${roomId}: ${message.type}`)
  }
}
