import type { ClientMessage, ServerMessage, PlayerRole } from '@heist/shared'
import { CHAT_MESSAGE_MAX_LEN, TARGET_ID_MAX_LEN } from '@heist/shared'
import type { RoomManager } from '../lobby'
import type { GameSessionManager } from '../game/session-manager'

type Responder = (msg: ServerMessage) => void
type ThiefBroadcast = (roomId: string, msg: ServerMessage, excludeRoles?: string[]) => void

const MAX_NAME_LEN = 24
const MAX_ROOM_ID_LEN = 12

export class MessageRouter {
  constructor(
    private manager: RoomManager,
    private broadcastToThieves?: (roomId: string, msg: ServerMessage) => void,
    private sessionManager?: GameSessionManager,
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
      case 'player_move':
        return this.handlePlayerMove(playerId, message, respond)
      case 'player_action':
        return this.handlePlayerAction(playerId, message, respond)
      case 'security_action':
        return this.handleSecurityAction(playerId, message, respond)
      case 'reset_room':
        return this.handleResetRoom(playerId, respond)
      case 'request_replay':
        return this.handleRequestReplay(playerId, respond)
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
      message.playerName.trim().length > MAX_NAME_LEN
    ) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid player name.',
      })
      return
    }

    if (this.manager.getRoomForPlayer(playerId)) {
      respond({ type: 'error', code: 'ALREADY_IN_ROOM', message: 'You are already in a room.' })
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
      message.playerName.trim().length > MAX_NAME_LEN
    ) {
      respond({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid player name.',
      })
      return
    }

    if (this.manager.getRoomForPlayer(playerId)) {
      respond({ type: 'error', code: 'ALREADY_IN_ROOM', message: 'You are already in a room.' })
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

    if (!message.message || typeof message.message !== 'string') {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'chat requires a "message" string.' })
      return
    }

    const text = message.message.slice(0, CHAT_MESSAGE_MAX_LEN).trim()
    if (!text) return

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.phase !== 'planning' && room.phase !== 'heist') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Chat is only available during planning or heist.' })
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

  private handlePlayerMove(
    playerId: string,
    message: Extract<ClientMessage, { type: 'player_move' }>,
    respond: Responder,
  ): void {
    if (typeof message.dx !== 'number' || typeof message.dy !== 'number') {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'player_move requires numeric dx and dy.' })
      return
    }

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.phase !== 'heist') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Movement is only available during the heist phase.' })
      return
    }

    const session = this.sessionManager?.getSession(room.id)
    if (!session) return

    session.engine.handlePlayerMove(playerId, message.dx, message.dy)
  }

  private handlePlayerAction(
    playerId: string,
    message: Extract<ClientMessage, { type: 'player_action' }>,
    respond: Responder,
  ): void {
    const validActions = ['pick_lock', 'destroy_camera', 'disable_alarm', 'take_loot', 'drop_loot']
    if (
      !validActions.includes(message.action) ||
      typeof message.targetId !== 'string' ||
      message.targetId.length > TARGET_ID_MAX_LEN
    ) {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid player_action.' })
      return
    }

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.phase !== 'heist') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Actions are only available during the heist phase.' })
      return
    }

    const player = room.players.find(p => p.id === playerId)
    if (!player || player.role !== 'thief') {
      respond({ type: 'error', code: 'ACTION_DENIED', message: 'Only thieves can use player_action.' })
      return
    }

    const session = this.sessionManager?.getSession(room.id)
    if (!session) return

    session.engine.handlePlayerAction(playerId, message.action, message.targetId)
  }

  private handleSecurityAction(
    playerId: string,
    message: Extract<ClientMessage, { type: 'security_action' }>,
    respond: Responder,
  ): void {
    const validActions = ['lock_door', 'unlock_door', 'trigger_alarm', 'cut_lights', 'release_guard']
    if (!validActions.includes(message.action)) {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid security_action.' })
      return
    }

    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.phase !== 'heist') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Security actions are only available during the heist phase.' })
      return
    }

    const player = room.players.find(p => p.id === playerId)
    if (!player || player.role !== 'security') {
      respond({ type: 'error', code: 'ACTION_DENIED', message: 'Only the security player can use security_action.' })
      return
    }

    const session = this.sessionManager?.getSession(room.id)
    if (!session) return

    const targetId = message.targetId
    if (targetId !== undefined && (typeof targetId !== 'string' || targetId.length > TARGET_ID_MAX_LEN)) {
      respond({ type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid targetId.' })
      return
    }
    session.engine.handleSecurityAction(playerId, message.action, targetId, message.patrolPath)
  }

  private handleRequestReplay(playerId: string, respond: Responder): void {
    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.phase !== 'resolution' && room.phase !== 'replay') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Replay is only available after the game ends.' })
      return
    }

    this.sessionManager?.sendReplay(room.id, playerId)
  }

  private handleResetRoom(playerId: string, respond: Responder): void {
    const room = this.manager.getRoomForPlayer(playerId)
    if (!room) {
      respond({ type: 'error', code: 'NOT_IN_ROOM', message: 'You are not currently in a room.' })
      return
    }

    if (room.hostId !== playerId) {
      respond({ type: 'error', code: 'NOT_HOST', message: 'Only the host can reset the room.' })
      return
    }

    // Only allow reset from lobby or resolution — not mid-heist (prevents win-denial abuse)
    if (room.phase !== 'lobby' && room.phase !== 'resolution' && room.phase !== 'replay') {
      respond({ type: 'error', code: 'WRONG_PHASE', message: 'Cannot reset the room during an active heist.' })
      return
    }

    // Stop any active game session (clears tick interval) before mutating phase
    this.sessionManager?.stopRoom(room.id)

    // Reset room phase to lobby and unready all players
    room.phase = 'lobby'
    for (const p of room.players) {
      p.ready = false
    }

    respond({ type: 'room_state', room })
  }
}
