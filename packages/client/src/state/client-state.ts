import { signal, computed } from '@preact/signals'
import type { GameRoom, GameState, PlayerInfo } from '@heist/shared'

// Connection state
export const wsConnected = signal<boolean>(false)

// Player identity
export const myPlayerId = signal<string | null>(null)
export const myPlayerName = signal<string>('')

// Room state
export const currentRoom = signal<GameRoom | null>(null)

// Derived state
export const myPlayer = computed<PlayerInfo | null>(() => {
  const room = currentRoom.value
  const id = myPlayerId.value
  if (!room || !id) return null
  return room.players.find((p: PlayerInfo) => p.id === id) ?? null
})

const securityPlayer = computed<PlayerInfo | null>(() => {
  const room = currentRoom.value
  return room?.players.find((p: PlayerInfo) => p.role === 'security') ?? null
})

export const isSecurityTaken = computed<boolean>(() => {
  return securityPlayer.value !== null
})

// Game state (set when game_start received)
export const currentGameState = signal<GameState | null>(null)

// Planning phase countdown
export const planningSecondsRemaining = signal<number>(60)

// Thief chat messages (thieves only)
export interface ChatEntry { fromName: string; message: string; id: number }
export const chatMessages = signal<ChatEntry[]>([])
let chatSeq = 0
export function addChatMessage(fromName: string, message: string): void {
  chatMessages.value = [...chatMessages.value, { fromName, message, id: chatSeq++ }]
}

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
