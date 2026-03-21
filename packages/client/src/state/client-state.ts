import { signal, computed } from '@preact/signals'
import type { GameRoom, PlayerInfo, GamePhase } from '@heist/shared'

// Connection state
export const wsConnected = signal<boolean>(false)

// Player identity
export const myPlayerId = signal<string | null>(null)
export const myPlayerName = signal<string>('')

// Room state
export const currentRoom = signal<GameRoom | null>(null)
export const currentRoomId = computed<string | null>(() => currentRoom.value?.id ?? null)

// Derived state
export const myPlayer = computed<PlayerInfo | null>(() => {
  const room = currentRoom.value
  const id = myPlayerId.value
  if (!room || !id) return null
  return room.players.find(p => p.id === id) ?? null
})

export const isHost = computed<boolean>(() => {
  const room = currentRoom.value
  const id = myPlayerId.value
  return room?.hostId === id
})

export const canStartGame = computed<boolean>(() => {
  const room = currentRoom.value
  if (!room) return false
  const allReady = room.players.every(p => p.ready)
  const hasSecurity = room.players.some(p => p.role === 'security')
  const hasEnoughPlayers = room.players.length >= 3
  return allReady && hasSecurity && hasEnoughPlayers
})

export const securityPlayer = computed<PlayerInfo | null>(() => {
  const room = currentRoom.value
  return room?.players.find(p => p.role === 'security') ?? null
})

export const isSecurityTaken = computed<boolean>(() => {
  return securityPlayer.value !== null
})

// UI state
export const errorMessage = signal<string | null>(null)
export const isLoading = signal<boolean>(false)

// Actions
export function setRoom(room: GameRoom | null): void {
  currentRoom.value = room
}

export function clearError(): void {
  errorMessage.value = null
}

export function setError(msg: string): void {
  errorMessage.value = msg
}
