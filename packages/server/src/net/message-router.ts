import type { ClientMessage, ServerMessage, PlayerRole } from '@heist/shared'
import type { RoomManager } from '../lobby'

type Responder = (msg: ServerMessage) => void

export class MessageRouter {
  constructor(private manager: RoomManager) {}

  route(playerId: string, message: ClientMessage, respond: Responder): void {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Message must be a JSON object with a "type" field.',
      })
      return
    }

    switch (message.type) {
      case 'create_room':
        return this.handleCreateRoom(playerId, message, respond)
      case 'join_room':
        return this.handleJoinRoom(playerId, message, respond)
      case 'select_role':
        return this.handleSelectRole(playerId, message, respond)
      case 'set_ready':
        return this.handleSetReady(playerId, message, respond)
      case 'chat':
        return this.handleChat(playerId, message, respond)
      default:
        respond({
          type: 'error',
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: '${(message as { type: string }).type}'`,
        })
    }
  }

  private handleCreateRoom(
    playerId: string,
    message: Extract<ClientMessage, { type: 'create_room' }>,
    respond: Responder,
  ): void {
    if (!message.playerName || typeof message.playerName !== 'string') {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'create_room requires a "playerName" string field.',
      })
      return
    }

    const result = this.manager.createRoom(message.playerName)
    if ('error' in result) {
      respond({ type: 'error', code: 'CREATE_ROOM_FAILED', message: result.error })
      return
    }

    // Track player -> room mapping via the manager
    // Override the auto-generated player ID with the socket's player ID
    // (In production, the socket handler would use the returned player.id)
    this.manager.playerRoomMap.set(playerId, result.room.id)
    // Also store the generated player id -> room mapping
    this.manager.playerRoomMap.set(result.player.id, result.room.id)

    respond({
      type: 'room_created',
      roomId: result.room.id,
      playerId: result.player.id,
    })
  }

  private handleJoinRoom(
    playerId: string,
    message: Extract<ClientMessage, { type: 'join_room' }>,
    respond: Responder,
  ): void {
    if (!message.roomId || typeof message.roomId !== 'string') {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'join_room requires a "roomId" string field.',
      })
      return
    }

    if (!message.playerName || typeof message.playerName !== 'string') {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'join_room requires a "playerName" string field.',
      })
      return
    }

    const result = this.manager.joinRoom(message.roomId, message.playerName)
    if ('error' in result) {
      respond({ type: 'error', code: 'JOIN_ROOM_FAILED', message: result.error })
      return
    }

    this.manager.playerRoomMap.set(playerId, result.room.id)

    respond({
      type: 'room_joined',
      roomId: result.room.id,
      playerId: result.player.id,
      players: result.room.players,
    })
  }

  private handleSelectRole(
    playerId: string,
    message: Extract<ClientMessage, { type: 'select_role' }>,
    respond: Responder,
  ): void {
    if (!message.role || !['security', 'thief', 'unassigned'].includes(message.role)) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'select_role requires a valid "role" field (security | thief | unassigned).',
      })
      return
    }

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'You are not currently in a room.',
      })
      return
    }

    // Find the actual player in the room by socket playerId or by checking playerRoomMap
    // The router uses the socket playerId, but lobby creates its own IDs.
    // We need to find the player whose room matches
    const player = room.players.find(p => {
      const mappedRoom = this.manager.playerRoomMap.get(p.id)
      return mappedRoom === room.id && p.id === playerId
    }) || room.players.find(p => {
      // Fall back: check if playerId is in room's player list
      return p.id === playerId
    })

    if (!player) {
      // Try to find via the socket->room mapping indirectly
      // The socket might have a different ID than the lobby's player ID
      respond({
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'You are not currently in a room.',
      })
      return
    }

    const result = this.manager.selectRole(room.id, player.id, message.role as PlayerRole)
    if ('error' in result) {
      respond({ type: 'error', code: 'SELECT_ROLE_FAILED', message: result.error })
      return
    }

    respond({ type: 'room_state', room: result.room })
  }

  private handleSetReady(
    playerId: string,
    message: Extract<ClientMessage, { type: 'set_ready' }>,
    respond: Responder,
  ): void {
    if (typeof message.ready !== 'boolean') {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'set_ready requires a "ready" boolean field.',
      })
      return
    }

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'You are not currently in a room.',
      })
      return
    }

    const player = room.players.find(p => p.id === playerId)
    if (!player) {
      respond({
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'You are not currently in a room.',
      })
      return
    }

    const result = this.manager.setReady(room.id, player.id, message.ready)
    if ('error' in result) {
      respond({ type: 'error', code: 'SET_READY_FAILED', message: result.error })
      return
    }

    respond({ type: 'room_state', room: result.room })
  }

  private handleChat(
    playerId: string,
    message: Extract<ClientMessage, { type: 'chat' }>,
    respond: Responder,
  ): void {
    // Chat is handled by broadcasting to all room members in the socket handler
    // For now, just acknowledge
    respond({
      type: 'error',
      code: 'NOT_IMPLEMENTED',
      message: 'Chat will be implemented in a future phase.',
    })
  }
}
