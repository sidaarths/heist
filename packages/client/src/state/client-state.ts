import { signal, computed } from '@preact/signals'
import type { GameRoom, GameState, PlayerInfo } from '@heist/shared'
import { PLANNING_DURATION_MS } from '@heist/shared'

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

// Planning phase countdown — initialised from the shared constant so it stays in sync
export const planningSecondsRemaining = signal<number>(Math.floor(PLANNING_DURATION_MS / 1000))

// Thief chat messages (thieves only)
export interface ChatEntry { fromName: string; message: string; id: number }
export const chatMessages = signal<ChatEntry[]>([])
let chatSeq = 0
const MAX_CHAT_DISPLAY = 200

export function addChatMessage(fromName: string, message: string): void {
  const next = [...chatMessages.value, { fromName, message, id: chatSeq++ }]
  chatMessages.value = next.length > MAX_CHAT_DISPLAY ? next.slice(-MAX_CHAT_DISPLAY) : next
}
export function clearChatMessages(): void {
  chatMessages.value = []
  chatSeq = 0
}

// ─── Game-over / result state ─────────────────────────────────────────────────
export interface GameOverResult {
  winner: 'thieves' | 'security'
  reason: string
}

export const gameOverResult = signal<GameOverResult | null>(null)

export function handleGameOver(winner: 'thieves' | 'security', reason: string): void {
  gameOverResult.value = { winner, reason }
  if (currentRoom.value) {
    currentRoom.value = { ...currentRoom.value, phase: 'resolution' }
  }
}

export function clearGameOver(): void {
  gameOverResult.value = null
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
