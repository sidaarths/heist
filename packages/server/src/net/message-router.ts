import type { ClientMessage, ServerMessage, PlayerRole } from '@heist/shared'
import type { RoomManager } from '../lobby'

type Responder = (msg: ServerMessage) => void
type ThiefBroadcast = (roomId: string, msg: ServerMessage, excludeRoles?: string[]) => void

const MAX_NAME_LEN = 24
const MAX_ROOM_ID_LEN = 12

export class MessageRouter {
  constructor(
    private manager: RoomManager,
    private broadcastToThieves?: (roomId: string, msg: ServerMessage) => void,
  ) {}

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
      case 'start_game':
        return this.handleStartGame(playerId, respond)
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
    if (
      !message.playerName ||
      typeof message.playerName !== 'string' ||
      message.playerName.trim().length === 0 ||
      message.playerName.length > MAX_NAME_LEN
    ) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid player name.',
      })
      return
    }

    const result = this.manager.createRoom(message.playerName, playerId)
    if ('error' in result) {
      respond({ type: 'error', code: 'CREATE_ROOM_FAILED', message: result.error })
      return
    }

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
    if (
      !message.roomId ||
      typeof message.roomId !== 'string' ||
      message.roomId.length > MAX_ROOM_ID_LEN
    ) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid room code.',
      })
      return
    }

    if (
      !message.playerName ||
      typeof message.playerName !== 'string' ||
      message.playerName.trim().length === 0 ||
      message.playerName.length > MAX_NAME_LEN
    ) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid player name.',
      })
      return
    }

    const result = this.manager.joinRoom(message.roomId, message.playerName, playerId)
    if ('error' in result) {
      respond({ type: 'error', code: 'JOIN_ROOM_FAILED', message: result.error })
      return
    }

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

    const result = this.manager.selectRole(room.id, playerId, message.role as PlayerRole)
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

    const result = this.manager.setReady(room.id, playerId, message.ready)
    if ('error' in result) {
      respond({ type: 'error', code: 'SET_READY_FAILED', message: result.error })
      return
    }

    respond({ type: 'room_state', room: result.room })
  }

  private handleStartGame(playerId: string, respond: Responder): void {
    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    const result = this.manager.startGame(room.id, playerId)
    if ('error' in result) {
      respond({ type: 'error', code: 'START_GAME_FAILED', message: result.error })
      return
    }

    respond({ type: 'room_state', room: result.room })
  }

  private handleChat(
    playerId: string,
    message: Extract<ClientMessage, { type: 'chat' }>,
    respond: Responder,
  ): void {
    const MAX_MSG_LEN = 200

    if (!message.message || typeof message.message !== 'string') {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'chat requires a "message" string.' })
      return
    }

    const text = message.message.slice(0, MAX_MSG_LEN).trim()
    if (!text) return

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    const sender = room.players.find(p => p.id === playerId)
    if (!sender) return

    // Only thieves can chat; security cannot send or receive thief chat
    if (sender.role !== 'thief') {
      respond({ type: 'error', code: 'CHAT_DENIED', message: 'Security cannot use thief chat.' })
      return
    }

    const chatMsg: ServerMessage = {
      type: 'chat_message',
      fromId: playerId,
      fromName: sender.name,
      message: text,
    }

    this.broadcastToThieves?.(room.id, chatMsg)
  }
}
