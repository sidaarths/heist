import type { GameState } from '@heist/shared'
import {
  PICK_LOCK_TICKS,
  DESTROY_CAMERA_TICKS,
  DISABLE_ALARM_TICKS,
  LOCKDOWN_DURATION_MS,
  TICK_MS,
} from '@heist/shared'

/** Distance (in tile units) within which a player must stay to continue an interaction. */
const INTERACTION_CANCEL_RADIUS = 2

export type InteractionType = 'pick_lock' | 'destroy_camera' | 'disable_alarm'

export interface ActiveInteraction {
  type: InteractionType
  targetId: string
  ticksRemaining: number
  /** Player position when interaction was started — used for cancellation detection. */
  startX: number
  startY: number
}

/** Map of playerId → active interaction */
export type InteractionMap = Map<string, ActiveInteraction>

/**
 * Start a new thief interaction (pick_lock | destroy_camera | disable_alarm).
 * Replaces any existing interaction for this player.
 */
export function startInteraction(
  state: GameState,
  playerId: string,
  type: InteractionType,
  targetId: string,
  interactions: InteractionMap,
): void {
  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  // Validate target exists and is in the correct state to start interaction
  if (type === 'pick_lock') {
    const door = state.doors.find(d => d.id === targetId)
    if (!door || !door.locked) return
  } else if (type === 'destroy_camera') {
    const camera = state.cameras.find(c => c.id === targetId)
    if (!camera || camera.destroyed) return
  } else if (type === 'disable_alarm') {
    const panel = state.alarmPanels.find(p => p.id === targetId)
    if (!panel) return
  }

  const ticksMap: Record<InteractionType, number> = {
    pick_lock: PICK_LOCK_TICKS,
    destroy_camera: DESTROY_CAMERA_TICKS,
    disable_alarm: DISABLE_ALARM_TICKS,
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
 * Cancels interactions where the player has moved.
 * Applies effects when an interaction completes.
 */
export function tickInteractions(state: GameState, interactions: InteractionMap): void {
  for (const [playerId, interaction] of interactions.entries()) {
    const pos = state.playerPositions.find(p => p.playerId === playerId)
    if (!pos) {
      interactions.delete(playerId)
      continue
    }

    // Cancel if player moved away from start position
    const dx = pos.x - interaction.startX
    const dy = pos.y - interaction.startY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > INTERACTION_CANCEL_RADIUS) {
      interactions.delete(playerId)
      continue
    }

    interaction.ticksRemaining--

    if (interaction.ticksRemaining <= 0) {
      // Interaction complete — apply effect
      applyInteractionEffect(state, interaction)
      interactions.delete(playerId)
    }
  }
}

function applyInteractionEffect(state: GameState, interaction: ActiveInteraction): void {
  switch (interaction.type) {
    case 'pick_lock': {
      const door = state.doors.find(d => d.id === interaction.targetId)
      if (door) door.locked = false
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
      // Reset lockdown countdown to full in case alarm is re-triggered
      state.lockdownTicksRemaining = Math.floor(LOCKDOWN_DURATION_MS / TICK_MS)
      break
    }
  }
}

/**
 * Handle a take_loot action: attach loot to player if it is not already carried.
 */
export function handleTakeLoot(
  state: GameState,
  playerId: string,
  lootId: string,
): void {
  const lootItem = state.loot.find(l => l.id === lootId)
  if (!lootItem) return
  if (lootItem.carried) return // already carried by someone

  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  lootItem.carried = true
  lootItem.carriedBy = playerId
  pos.lootCarried.push(lootId)
}

/**
 * Handle a drop_loot action: detach loot from player and place it at their position.
 */
export function handleDropLoot(
  state: GameState,
  playerId: string,
  lootId: string,
): void {
  const lootItem = state.loot.find(l => l.id === lootId)
  if (!lootItem) return
  if (lootItem.carriedBy !== playerId) return // not carried by this player

  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  lootItem.carried = false
  lootItem.carriedBy = null
  lootItem.x = pos.x
  lootItem.y = pos.y

  pos.lootCarried = pos.lootCarried.filter(id => id !== lootId)
}
