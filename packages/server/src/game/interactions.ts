import type { GameState } from '@heist/shared'
import {
  PICK_LOCK_TICKS,
  DESTROY_CAMERA_TICKS,
  DISABLE_ALARM_TICKS,
  ALARM_LOCKDOWN_TICKS,
  MAX_LOOT_CARRY,
  AUTO_PICKUP_RADIUS,
} from '@heist/shared'

/**
 * How close (in tile units) a player must be to start an interaction.
 * The server enforces this so clients can't interact through walls.
 */
const INTERACTION_START_RANGE = 2.0

/** Distance (in tile units) player must stay within to keep interaction active. */
const INTERACTION_CANCEL_RADIUS = 2.5

export type InteractionType = 'pick_lock' | 'destroy_camera' | 'disable_alarm'

export interface ActiveInteraction {
  type: InteractionType
  targetId: string
  ticksRemaining: number
  /** Player position when interaction was started — used for cancellation. */
  startX: number
  startY: number
}

export type InteractionMap = Map<string, ActiveInteraction>

/**
 * Start a new thief interaction. Validates:
 *  - Player exists and is not frozen
 *  - Target exists and is in the right state
 *  - Player is close enough to the target (INTERACTION_START_RANGE)
 *  - For disable_alarm: the alarm must currently be triggered
 */
export function startInteraction(
  state: GameState,
  playerId: string,
  type: InteractionType,
  targetId: string,
  interactions: InteractionMap,
): void {
  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos || pos.frozen) return

  let targetX = -1, targetY = -1

  if (type === 'pick_lock') {
    const door = state.doors.find(d => d.id === targetId)
    if (!door || !door.locked) return
    targetX = door.x; targetY = door.y

  } else if (type === 'destroy_camera') {
    const camera = state.cameras.find(c => c.id === targetId)
    if (!camera || camera.destroyed) return
    targetX = camera.x; targetY = camera.y

  } else if (type === 'disable_alarm') {
    // Can only disable an alarm panel when the alarm has been triggered
    if (!state.alarmTriggered) return
    const panel = state.alarmPanels.find(p => p.id === targetId)
    if (!panel || panel.disabled) return
    targetX = panel.x; targetY = panel.y
  }

  // Proximity check: player must be within range of the target (Euclidean)
  const distX = pos.x - targetX
  const distY = pos.y - targetY
  if (Math.sqrt(distX * distX + distY * distY) > INTERACTION_START_RANGE) return

  const ticksMap: Record<InteractionType, number> = {
    pick_lock:      PICK_LOCK_TICKS,
    destroy_camera: DESTROY_CAMERA_TICKS,
    disable_alarm:  DISABLE_ALARM_TICKS,
  }

  interactions.set(playerId, {
    type,
    targetId,
    ticksRemaining: ticksMap[type],
    startX: pos.x,
    startY: pos.y,
  })
}

/**
 * Advance all active interactions by one tick.
 * Cancels if player moved too far from start.
 * Applies effect when ticks reach zero.
 */
export function tickInteractions(state: GameState, interactions: InteractionMap): void {
  for (const [playerId, interaction] of interactions.entries()) {
    const pos = state.playerPositions.find(p => p.playerId === playerId)
    if (!pos) {
      interactions.delete(playerId)
      continue
    }

    // Cancel if player is frozen (guard caught them mid-interaction)
    if (pos.frozen) {
      interactions.delete(playerId)
      continue
    }

    // Cancel if player moved too far
    const dx = pos.x - interaction.startX
    const dy = pos.y - interaction.startY
    if (Math.sqrt(dx * dx + dy * dy) > INTERACTION_CANCEL_RADIUS) {
      interactions.delete(playerId)
      continue
    }

    interaction.ticksRemaining--

    if (interaction.ticksRemaining <= 0) {
      applyInteractionEffect(state, interaction)
      interactions.delete(playerId)
    }
  }
}

function applyInteractionEffect(state: GameState, interaction: ActiveInteraction): void {
  switch (interaction.type) {
    case 'pick_lock': {
      const door = state.doors.find(d => d.id === interaction.targetId)
      if (door) { door.locked = false; door.open = true }
      break
    }
    case 'destroy_camera': {
      const camera = state.cameras.find(c => c.id === interaction.targetId)
      if (camera) camera.destroyed = true
      break
    }
    case 'disable_alarm': {
      const panel = state.alarmPanels.find(p => p.id === interaction.targetId)
      if (panel) panel.disabled = true
      state.alarmTriggered = false
      // Restore pre-alarm timer, subtracting the lockdown ticks already elapsed
      // so thieves can't recover more time than they lost.
      if (state.preAlarmTicksRemaining !== null) {
        const elapsed = ALARM_LOCKDOWN_TICKS - state.heistTicksRemaining
        state.heistTicksRemaining = state.preAlarmTicksRemaining - elapsed
        state.preAlarmTicksRemaining = null
      }
      break
    }
  }
}

/** Attach loot to player — validated with proximity check. */
export function handleTakeLoot(
  state: GameState,
  playerId: string,
  lootId: string,
): void {
  const lootItem = state.loot.find(l => l.id === lootId)
  if (!lootItem || lootItem.carried) return

  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  // Cap carried items: thieves only need MAX_LOOT_CARRY (= LOOT_TO_WIN) to win
  if (pos.lootCarried.length >= MAX_LOOT_CARRY) return

  // Proximity check (Euclidean)
  const ldx = pos.x - lootItem.x
  const ldy = pos.y - lootItem.y
  if (Math.sqrt(ldx * ldx + ldy * ldy) > 2.0) return

  lootItem.carried = true
  lootItem.carriedBy = playerId
  pos.lootCarried.push(lootId)
}

/**
 * Auto-pickup: each non-frozen thief automatically collects unclaimed loot
 * within AUTO_PICKUP_RADIUS tiles. At most one item per thief per tick.
 * Respects MAX_LOOT_CARRY cap.
 */
export function autoPickupLoot(state: GameState): void {
  const thiefIds = new Set(
    state.room.players.filter(p => p.role === 'thief').map(p => p.id),
  )

  for (const pos of state.playerPositions) {
    if (!thiefIds.has(pos.playerId)) continue
    if (pos.frozen) continue
    if (pos.lootCarried.length >= MAX_LOOT_CARRY) continue

    for (const lootItem of state.loot) {
      if (lootItem.carried) continue
      const dx = pos.x - lootItem.x
      const dy = pos.y - lootItem.y
      if (Math.sqrt(dx * dx + dy * dy) <= AUTO_PICKUP_RADIUS) {
        lootItem.carried = true
        lootItem.carriedBy = pos.playerId
        pos.lootCarried.push(lootItem.id)
        break // one item per thief per tick
      }
    }
  }
}

/** Drop loot at player's current position. */
export function handleDropLoot(
  state: GameState,
  playerId: string,
  lootId: string,
): void {
  const lootItem = state.loot.find(l => l.id === lootId)
  if (!lootItem || lootItem.carriedBy !== playerId) return

  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  lootItem.carried = false
  lootItem.carriedBy = null
  lootItem.x = Math.floor(pos.x)
  lootItem.y = Math.floor(pos.y)
  pos.lootCarried = pos.lootCarried.filter(id => id !== lootId)
}
