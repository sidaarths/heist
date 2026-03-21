import type { GameRoom, PlayerInfo, PlayerRole } from '@heist/shared'
import {
  MAX_PLAYERS,
  MAX_ROOMS,
  MIN_PLAYERS,
  ROOM_CODE_LENGTH,
} from '@heist/shared'
import { randomBytes } from 'crypto'

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type CreateRoomSuccess = { room: GameRoom; player: PlayerInfo }
type CreateRoomError = { error: string }
type RoomResult = { room: GameRoom; player: PlayerInfo } | { error: string }
type RoleResult = { room: GameRoom } | { error: string }
type ReadyResult = { room: GameRoom; started: boolean } | { error: string }
type LeaveResult = { room: GameRoom | null }

export class RoomManager {
  rooms: Map<string, GameRoom> = new Map()
  // Map playerId -> roomId for quick lookups
  playerRoomMap: Map<string, string> = new Map()

  generateRoomCode(): string {
    const bytes = randomBytes(ROOM_CODE_LENGTH)
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length]
    }
    // Ensure uniqueness
    if (this.rooms.has(code)) {
      return this.generateRoomCode()
    }
    return code
  }

  createRoom(playerName: string, playerId: string): RoomResult {
    if (this.rooms.size >= MAX_ROOMS) {
      return { error: 'Server has reached the max number of rooms. Please try again later.' }
    }

    const roomId = this.generateRoomCode()

    const player: PlayerInfo = {
      id: playerId,
      name: playerName,
      role: 'unassigned',
      ready: false,
      connected: true,
    }

    const room: GameRoom = {
      id: roomId,
      phase: 'lobby',
      players: [player],
      hostId: playerId,
      createdAt: Date.now(),
    }

    this.rooms.set(roomId, room)
    this.playerRoomMap.set(playerId, roomId)

    return { room, player }
  }

  joinRoom(roomId: string, playerName: string, playerId: string): RoomResult {
    const normalizedId = roomId.toUpperCase()
    const room = this.rooms.get(normalizedId)

    if (!room) {
      return { error: `Room '${roomId}' not found. Check the code and try again.` }
    }

    if (room.phase !== 'lobby') {
      return { error: 'Game has already started. Cannot join mid-game.' }
    }

    if (room.players.length >= MAX_PLAYERS) {
      return { error: 'Room is full. Maximum 5 players allowed.' }
    }

    const player: PlayerInfo = {
      id: playerId,
      name: playerName,
      role: 'unassigned',
      ready: false,
      connected: true,
    }

    room.players.push(player)
    this.playerRoomMap.set(playerId, room.id)

    return { room, player }
  }

  selectRole(roomId: string, playerId: string, role: PlayerRole): RoleResult {
    const room = this.rooms.get(roomId)
    if (!room) {
      return { error: `Room '${roomId}' not found.` }
    }

    const player = room.players.find(p => p.id === playerId)
    if (!player) {
      return { error: 'Player not found in room.' }
    }

    if (player.ready) {
      return { error: 'Cannot change role while ready. Unready first.' }
    }

    // Check if Security is already claimed by someone else
    if (role === 'security') {
      const existingSecurity = room.players.find(
        p => p.role === 'security' && p.id !== playerId
      )
      if (existingSecurity) {
        return { error: 'Security role is already taken by another player.' }
      }
    }

    player.role = role

    return { room }
  }

  setReady(roomId: string, playerId: string, ready: boolean): ReadyResult {
    const room = this.rooms.get(roomId)
    if (!room) {
      return { error: `Room '${roomId}' not found.` }
    }

    const player = room.players.find(p => p.id === playerId)
    if (!player) {
      return { error: 'Player not found in room.' }
    }

    player.ready = ready

    // Check if game can start
    const allReady = room.players.every(p => p.ready)
    const hasEnoughPlayers = room.players.length >= MIN_PLAYERS
    const hasSecurity = room.players.some(p => p.role === 'security')
    const allAssigned = room.players.every(p => p.role !== 'unassigned')

    if (allReady && hasEnoughPlayers && hasSecurity && allAssigned) {
      room.phase = 'planning'
      return { room, started: true }
    }

    return { room, started: false }
  }

  leaveRoom(roomId: string, playerId: string): LeaveResult {
    const room = this.rooms.get(roomId)
    if (!room) {
      return { room: null }
    }

    const playerIndex = room.players.findIndex(p => p.id === playerId)
    if (playerIndex === -1) {
      return { room }
    }

    room.players.splice(playerIndex, 1)
    this.playerRoomMap.delete(playerId)

    // If room is now empty, clean it up
    if (room.players.length === 0) {
      this.rooms.delete(roomId)
      return { room: null }
    }

    // If host left, reassign host to next player
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id
    }

    return { room }
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId.toUpperCase())
  }

  getRoomForPlayer(playerId: string): GameRoom | undefined {
    const roomId = this.playerRoomMap.get(playerId)
    if (!roomId) return undefined
    return this.rooms.get(roomId)
  }
}
