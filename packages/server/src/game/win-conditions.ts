import type { GameState } from '@heist/shared'
import { LOOT_TO_WIN } from '@heist/shared'

export interface WinResult {
  winner: 'thieves' | 'security'
  reason: string
}

/**
 * Check all win conditions for the current game state.
 *
 * Priority order:
 *   1. Thieves escape with enough loot
 *   2. Security lockdown countdown hits 0
 *   3. All thieves are trapped (all adjacent doors locked)
 *
 * Returns null if no win condition is met yet.
 */
export function checkWinConditions(state: GameState): WinResult | null {
  // ── 1. Thieves escape ─────────────────────────────────────────────────────
  const thiefPlayers = state.room.players.filter(p => p.role === 'thief')

  for (const thief of thiefPlayers) {
    const pos = state.playerPositions.find(p => p.playerId === thief.id)
    if (!pos) continue

    // Is this thief at the exit tile?
    if (pos.x === state.exit.x && pos.y === state.exit.y) {
      // Count total loot carried by this thief
      const lootCount = pos.lootCarried.length
      if (lootCount >= LOOT_TO_WIN) {
        return {
          winner: 'thieves',
          reason: `${thief.name} escaped with ${lootCount} loot items`,
        }
      }
    }
  }

  // ── 2. Lockdown countdown expires ────────────────────────────────────────
  if (state.alarmTriggered && state.lockdownTicksRemaining <= 0) {
    return {
      winner: 'security',
      reason: 'Lockdown expired — authorities have arrived',
    }
  }

  // ── 3. All thieves trapped ────────────────────────────────────────────────
  if (thiefPlayers.length > 0 && allThievesTrapped(state)) {
    return {
      winner: 'security',
      reason: 'All thieves are trapped in locked rooms',
    }
  }

  return null
}

/**
 * Returns true if every thief has at least one locked door adjacent to them
 * AND no thief is within range of an unlocked door.
 *
 * The trap condition is: every thief is surrounded only by locked doors within
 * a proximity radius. We check whether all thieves are "enclosed" by verifying
 * that each thief has no unlocked door within escape range (2 tiles).
 *
 * Simplification for game purposes: a thief is considered trapped if ALL doors
 * in the entire map within proximity are locked. A thief is free if any nearby
 * door is unlocked (they could use it).
 */
function allThievesTrapped(state: GameState): boolean {
  const TRAP_PROXIMITY = 3 // tiles

  const thiefPlayers = state.room.players.filter(p => p.role === 'thief')
  if (thiefPlayers.length === 0) return false

  for (const thief of thiefPlayers) {
    const pos = state.playerPositions.find(p => p.playerId === thief.id)
    if (!pos) return false

    // Find all doors within proximity
    const nearbyDoors = state.doors.filter(door => {
      const dx = door.x - pos.x
      const dy = door.y - pos.y
      return Math.sqrt(dx * dx + dy * dy) <= TRAP_PROXIMITY
    })

    // If there are no nearby doors at all, thief is not "trapped" — they're free
    if (nearbyDoors.length === 0) return false

    // If any nearby door is unlocked, thief is not trapped
    if (nearbyDoors.some(d => !d.locked)) return false
  }

  return true
}
