import type { GameState } from '@heist/shared'
import { LOOT_TO_WIN } from '@heist/shared'

export interface WinResult {
  winner: 'thieves' | 'security'
  reason: string
}

/**
 * Check all win conditions for the current game state.
 *
 * Thieves win by escaping with enough loot.
 * Security wins only when the heist timer runs out.
 *
 * Thieves are never resolved as "trapped" — they can always pick locks.
 */
export function checkWinConditions(state: GameState): WinResult | null {
  // ── 1. Thieves escape ─────────────────────────────────────────────────────
  const thiefPlayers = state.room.players.filter(p => p.role === 'thief')

  for (const thief of thiefPlayers) {
    const pos = state.playerPositions.find(p => p.playerId === thief.id)
    if (!pos) continue

    const dx = Math.abs(pos.x - state.exit.x)
    const dy = Math.abs(pos.y - state.exit.y)
    if (dx < 1 && dy < 1 && pos.lootCarried.length >= LOOT_TO_WIN) {
      return {
        winner: 'thieves',
        reason: `${thief.name} escaped with ${pos.lootCarried.length} loot items`,
      }
    }
  }

  // ── 2. Timer expires ──────────────────────────────────────────────────────
  if (state.alarmTriggered && state.lockdownTicksRemaining <= 0) {
    return {
      winner: 'security',
      reason: 'Lockdown expired — authorities have arrived',
    }
  }

  return null
}
