/**
 * client-state.test.ts — Unit tests for pure client-state functions.
 *
 * Tests handleGameOver, clearGameOver, addChatMessage, and clearChatMessages.
 *
 * These tests run with bun test (no DOM required — signals work in Node/Bun).
 */
import { describe, it, expect, beforeEach } from 'bun:test'

// We need to reset signal state between tests.
// Import signals directly so we can inspect and reset them.
import {
  currentRoom,
  myPlayerId,
  gameOverResult,
  handleGameOver,
  clearGameOver,
  addChatMessage,
  clearChatMessages,
  chatMessages,
} from '../../src/state/client-state'
import type { GameRoom } from '@heist/shared'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRoom(phase: GameRoom['phase'] = 'heist'): GameRoom {
  return {
    id: 'TEST01',
    phase,
    players: [],
    hostId: 'player-1',
    createdAt: Date.now(),
  }
}

function resetState() {
  currentRoom.value = null
  myPlayerId.value = null
  gameOverResult.value = null
  clearChatMessages()
}

// ─── handleGameOver ───────────────────────────────────────────────────────────

describe('handleGameOver', () => {
  beforeEach(resetState)

  it('sets gameOverResult with winner and reason', () => {
    handleGameOver('security', 'Lockdown complete')

    expect(gameOverResult.value).not.toBeNull()
    expect(gameOverResult.value?.winner).toBe('security')
    expect(gameOverResult.value?.reason).toBe('Lockdown complete')
  })

  it('sets gameOverResult for thieves win', () => {
    handleGameOver('thieves', 'Loot escaped')

    expect(gameOverResult.value?.winner).toBe('thieves')
    expect(gameOverResult.value?.reason).toBe('Loot escaped')
  })

  it('transitions room phase to resolution when room exists', () => {
    currentRoom.value = makeRoom('heist')

    handleGameOver('security', 'Lockdown')

    expect(currentRoom.value?.phase).toBe('resolution')
  })

  it('does not crash when currentRoom is null', () => {
    currentRoom.value = null

    expect(() => handleGameOver('thieves', 'They escaped')).not.toThrow()
    expect(gameOverResult.value?.winner).toBe('thieves')
  })

  it('preserves all other room fields when transitioning phase', () => {
    const room = makeRoom('heist')
    room.players = [{ id: 'p1', name: 'Alice', role: 'thief', ready: true, connected: true }]
    currentRoom.value = room

    handleGameOver('security', 'Trap')

    expect(currentRoom.value?.id).toBe('TEST01')
    expect(currentRoom.value?.players).toHaveLength(1)
    expect(currentRoom.value?.hostId).toBe('player-1')
  })
})

// ─── clearGameOver ────────────────────────────────────────────────────────────

describe('clearGameOver', () => {
  beforeEach(resetState)

  it('clears gameOverResult to null', () => {
    handleGameOver('security', 'reason')
    expect(gameOverResult.value).not.toBeNull()

    clearGameOver()
    expect(gameOverResult.value).toBeNull()
  })

  it('is safe to call when result is already null', () => {
    expect(() => clearGameOver()).not.toThrow()
  })
})

// ─── addChatMessage ───────────────────────────────────────────────────────────

describe('addChatMessage', () => {
  beforeEach(resetState)

  it('appends a message to chatMessages', () => {
    addChatMessage('Alice', 'hello crew')

    expect(chatMessages.value).toHaveLength(1)
    expect(chatMessages.value[0].fromName).toBe('Alice')
    expect(chatMessages.value[0].message).toBe('hello crew')
  })

  it('assigns a monotonically increasing id', () => {
    addChatMessage('A', 'first')
    addChatMessage('B', 'second')

    const [a, b] = chatMessages.value
    expect(b.id).toBeGreaterThan(a.id)
  })

  it('caps at 200 messages, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) {
      addChatMessage('X', `msg${i}`)
    }

    expect(chatMessages.value).toHaveLength(200)
    // Oldest messages (msg0..msg4) should be gone
    expect(chatMessages.value[0].message).toBe('msg5')
  })
})

// ─── clearChatMessages ────────────────────────────────────────────────────────

describe('clearChatMessages', () => {
  beforeEach(resetState)

  it('empties the chatMessages array', () => {
    addChatMessage('A', 'test')
    addChatMessage('B', 'test2')
    expect(chatMessages.value).toHaveLength(2)

    clearChatMessages()
    expect(chatMessages.value).toHaveLength(0)
  })

  it('resets the sequence counter so ids restart from 0', () => {
    addChatMessage('A', 'first') // id = 0 (or some positive n)
    clearChatMessages()
    addChatMessage('B', 'after reset')

    // After clearing, the next message should have a low id (reset to 0)
    expect(chatMessages.value[0].id).toBe(0)
  })

  it('is safe to call on empty array', () => {
    expect(() => clearChatMessages()).not.toThrow()
  })
})
