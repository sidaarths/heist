import { randomUUID } from 'crypto'
import type { GameState } from '@heist/shared'
import {
  COOLDOWN_LOCK_DOOR_TICKS,
  COOLDOWN_CUT_LIGHTS_TICKS,
  CUT_LIGHTS_DURATION_TICKS,
  LOCKDOWN_DURATION_MS,
  TICK_MS,
  FREEZE_DURATION_TICKS,
} from '@heist/shared'

/** Map: securityPlayerId → (actionName → ticksRemaining) */
export type SecurityCooldowns = Map<string, Map<string, number>>

/**
 * Distance threshold (in tile units) for guard-thief collision detection.
 * A guard freezes a thief if the thief is within this many units.
 */
const GUARD_COLLISION_RADIUS = 1.5

// ─── Internal helpers ────────────────────────────────────────────────────────

function isOnCooldown(cooldowns: SecurityCooldowns, playerId: string, action: string): boolean {
  const playerCooldowns = cooldowns.get(playerId)
  if (!playerCooldowns) return false
  const remaining = playerCooldowns.get(action)
  return remaining !== undefined && remaining > 0
}

function applyCooldown(cooldowns: SecurityCooldowns, playerId: string, action: string, ticks: number): void {
  if (!cooldowns.has(playerId)) {
    cooldowns.set(playerId, new Map())
  }
  cooldowns.get(playerId)!.set(action, ticks)
}

// ─── Action handlers ─────────────────────────────────────────────────────────

/**
 * Security: lock a door. Applies COOLDOWN_LOCK_DOOR_TICKS cooldown.
 * Rejected while cooldown is active.
 */
export function handleLockDoor(
  state: GameState,
  securityPlayerId: string,
  doorId: string,
  cooldowns: SecurityCooldowns,
): void {
  if (isOnCooldown(cooldowns, securityPlayerId, 'lock_door')) return

  const door = state.doors.find(d => d.id === doorId)
  if (!door) return

  door.locked = true
  applyCooldown(cooldowns, securityPlayerId, 'lock_door', COOLDOWN_LOCK_DOOR_TICKS)
}

/**
 * Security: unlock a door. Shares the same lock_door cooldown.
 */
export function handleUnlockDoor(
  state: GameState,
  securityPlayerId: string,
  doorId: string,
  cooldowns: SecurityCooldowns,
): void {
  if (isOnCooldown(cooldowns, securityPlayerId, 'lock_door')) return

  const door = state.doors.find(d => d.id === doorId)
  if (!door) return

  door.locked = false
  applyCooldown(cooldowns, securityPlayerId, 'lock_door', COOLDOWN_LOCK_DOOR_TICKS)
}

/**
 * Security: trigger the alarm. One-time action while not already triggered.
 * Starts the lockdown countdown.
 */
export function handleTriggerAlarm(
  state: GameState,
  securityPlayerId: string,
  cooldowns: SecurityCooldowns,
): void {
  // Cannot re-trigger while lockdown is already active
  if (state.alarmTriggered) return

  state.alarmTriggered = true
  state.lockdownTicksRemaining = Math.floor(LOCKDOWN_DURATION_MS / TICK_MS)
}

/**
 * Security: cut lights in a zone. Sets lightsOut = true for CUT_LIGHTS_DURATION_TICKS ticks.
 * Applies COOLDOWN_CUT_LIGHTS_TICKS cooldown.
 */
export function handleCutLights(
  state: GameState,
  securityPlayerId: string,
  cooldowns: SecurityCooldowns,
): void {
  if (isOnCooldown(cooldowns, securityPlayerId, 'cut_lights')) return

  state.lightsOut = true
  state.lightsOutRemainingTicks = CUT_LIGHTS_DURATION_TICKS
  applyCooldown(cooldowns, securityPlayerId, 'cut_lights', COOLDOWN_CUT_LIGHTS_TICKS)
}

/**
 * Security: release a guard with a specified patrol path.
 * Guard is spawned at the first waypoint. Requires ≥ 2 waypoints.
 */
export function handleReleaseGuard(
  state: GameState,
  securityPlayerId: string,
  patrolPath: Array<{ x: number; y: number }>,
): void {
  if (patrolPath.length < 2) return

  state.guards.push({
    id: randomUUID(),
    x: patrolPath[0].x,
    y: patrolPath[0].y,
    patrolPath,
    patrolIndex: 0,
    alerted: false,
  })
}

// ─── Per-tick operations ─────────────────────────────────────────────────────

/**
 * Advance security cooldown timers and lights-out countdown by one tick.
 * Also decrements freeze timers on frozen thieves.
 */
export function tickSecurityCooldowns(
  state: GameState,
  cooldowns: SecurityCooldowns,
): void {
  // Decrement all cooldowns
  for (const [playerId, playerCooldowns] of cooldowns.entries()) {
    for (const [action, remaining] of playerCooldowns.entries()) {
      const next = remaining - 1
      if (next <= 0) {
        playerCooldowns.delete(action)
      } else {
        playerCooldowns.set(action, next)
      }
    }
  }

  // Lights-out countdown
  if (state.lightsOut && state.lightsOutRemainingTicks > 0) {
    state.lightsOutRemainingTicks--
    if (state.lightsOutRemainingTicks <= 0) {
      state.lightsOut = false
      state.lightsOutRemainingTicks = 0
    }
  }

  // Freeze timers
  for (const pos of state.playerPositions) {
    if (pos.frozen && pos.frozenTicksRemaining > 0) {
      pos.frozenTicksRemaining--
      if (pos.frozenTicksRemaining <= 0) {
        pos.frozen = false
        pos.frozenTicksRemaining = 0
      }
    }
  }

  // Lockdown countdown (only while alarm is active)
  if (state.alarmTriggered && state.lockdownTicksRemaining > 0) {
    state.lockdownTicksRemaining--
  }
}

/**
 * Check all guard positions against thief positions.
 * Freeze any thief within GUARD_COLLISION_RADIUS of a guard.
 */
export function tickGuardCollisions(state: GameState): void {
  const thieves = state.room.players.filter(p => p.role === 'thief')
  const thiefIds = new Set(thieves.map(p => p.id))

  for (const guard of state.guards) {
    for (const pos of state.playerPositions) {
      if (!thiefIds.has(pos.playerId)) continue
      if (pos.frozen) {
        // Refresh freeze timer if already frozen (keep at max)
        pos.frozenTicksRemaining = FREEZE_DURATION_TICKS
        continue
      }

      const dx = pos.x - guard.x
      const dy = pos.y - guard.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= GUARD_COLLISION_RADIUS) {
        pos.frozen = true
        pos.frozenTicksRemaining = FREEZE_DURATION_TICKS
      }
    }
  }
}
