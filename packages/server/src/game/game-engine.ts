import type { GameState, ServerMessage } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import { BASE_MOVE_SPEED, REPLAY_BUFFER_MAX, ALARM_LOCKDOWN_TICKS, MAX_PATROL_WAYPOINTS } from '@heist/shared'
import { applyPlayerMove } from './movement'
import {
  startInteraction,
  tickInteractions,
  handleTakeLoot,
  handleDropLoot,
  type InteractionMap,
} from './interactions'
import {
  handleLockDoor,
  handleUnlockDoor,
  handleTriggerAlarm,
  handleCutLights,
  handleReleaseGuard,
  tickSecurityCooldowns,
  tickGuardCollisions,
  type SecurityCooldowns,
} from './security-actions'
import { checkWinConditions } from './win-conditions'
import type { ClientMessage } from '@heist/shared'

type BroadcastFn = (msg: ServerMessage) => void

export class GameEngine {
  replayBuffer: GameState[] = []
  private broadcast: BroadcastFn
  private onGameOver: (() => void) | undefined

  /** Active thief interactions (pick lock, destroy camera, disable alarm) */
  private interactions: InteractionMap = new Map()
  /** Security cooldowns per player */
  private cooldowns: SecurityCooldowns = new Map()

  constructor(
    private state: GameState,
    private map: MapDef,
    broadcast: BroadcastFn = () => {},
    onGameOver?: () => void,
  ) {
    this.broadcast = broadcast
    this.onGameOver = onGameOver
  }

  advanceTick(): void {
    if (this.state.room.phase !== 'heist') return

    this.advanceGuards()
    tickGuardCollisions(this.state)
    tickInteractions(this.state, this.interactions)
    tickSecurityCooldowns(this.state, this.cooldowns)
    this.tickCameraDetection()

    // Decrement global heist timer
    if (this.state.heistTicksRemaining > 0) {
      this.state.heistTicksRemaining--
    }

    this.state.tick++

    // Check win conditions after every state update
    const result = checkWinConditions(this.state)
    if (result) {
      this.state.room.phase = 'resolution'
      // Clean up transient alarm state before broadcasting final snapshot
      this.state.preAlarmTicksRemaining = null
      this.broadcast({ type: 'game_over', winner: result.winner, reason: result.reason })
      // Stop the tick loop — session manager clears the interval
      this.onGameOver?.()
    }

    // Bounded replay buffer — keep only the last REPLAY_BUFFER_MAX snapshots
    if (this.replayBuffer.length >= REPLAY_BUFFER_MAX) {
      this.replayBuffer.shift()
    }
    this.replayBuffer.push(structuredClone(this.state))
  }

  /**
   * Handle an incoming player_move message.
   */
  handlePlayerMove(playerId: string, dx: number, dy: number): void {
    if (this.state.room.phase !== 'heist') return
    applyPlayerMove(this.state, this.map, playerId, dx, dy)
  }

  /**
   * Handle an incoming player_action message (thief interactions + loot).
   */
  handlePlayerAction(
    playerId: string,
    action: Extract<ClientMessage, { type: 'player_action' }>['action'],
    targetId: string,
  ): void {
    if (this.state.room.phase !== 'heist') return

    switch (action) {
      case 'pick_lock':
      case 'destroy_camera':
      case 'disable_alarm':
        startInteraction(this.state, playerId, action, targetId, this.interactions)
        break
      case 'take_loot':
        handleTakeLoot(this.state, playerId, targetId)
        break
      case 'drop_loot':
        handleDropLoot(this.state, playerId, targetId)
        break
    }
  }

  /**
   * Handle an incoming security_action message.
   */
  handleSecurityAction(
    playerId: string,
    action: Extract<ClientMessage, { type: 'security_action' }>['action'],
    targetId?: string,
    patrolPath?: Array<{ x: number; y: number }>,
  ): void {
    if (this.state.room.phase !== 'heist') return

    // Verify caller is security
    const player = this.state.room.players.find(p => p.id === playerId)
    if (!player || player.role !== 'security') return

    switch (action) {
      case 'lock_door':
        if (targetId) handleLockDoor(this.state, playerId, targetId, this.cooldowns)
        break
      case 'unlock_door':
        if (targetId) handleUnlockDoor(this.state, playerId, targetId, this.cooldowns)
        break
      case 'trigger_alarm':
        handleTriggerAlarm(this.state, playerId, this.cooldowns)
        break
      case 'cut_lights':
        handleCutLights(this.state, playerId, this.cooldowns)
        break
      case 'release_guard':
        if (patrolPath) {
          // Cap waypoint count, then validate bounds before spawning
          const validPath = patrolPath
            .slice(0, MAX_PATROL_WAYPOINTS)
            .filter(
              wp => Number.isFinite(wp.x) && Number.isFinite(wp.y) &&
                    wp.x >= 0 && wp.x < this.map.width &&
                    wp.y >= 0 && wp.y < this.map.height,
            )
          if (validPath.length >= 2) handleReleaseGuard(this.state, playerId, validPath, this.cooldowns)
        }
        break
    }
  }

  /**
   * Check if any thief has entered an active camera's FOV.
   * If so, trigger the alarm (same logic as handleTriggerAlarm).
   */
  private tickCameraDetection(): void {
    if (this.state.alarmTriggered) return // alarm already active

    const thiefIds = new Set(
      this.state.room.players.filter(p => p.role === 'thief').map(p => p.id),
    )

    for (const cam of this.state.cameras) {
      if (cam.destroyed) continue

      for (const pos of this.state.playerPositions) {
        if (!thiefIds.has(pos.playerId)) continue

        const dx = pos.x - cam.x
        const dy = pos.y - cam.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist > 2.5) continue // outside FOV range

        const angle = Math.atan2(dy, dx)
        let diff = Math.abs(angle - cam.angle)
        if (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI)

        if (diff <= cam.fov / 2) {
          // Thief spotted — trigger alarm
          this.state.alarmTriggered = true
          if (this.state.heistTicksRemaining > ALARM_LOCKDOWN_TICKS) {
            this.state.preAlarmTicksRemaining = this.state.heistTicksRemaining
            this.state.heistTicksRemaining = ALARM_LOCKDOWN_TICKS
          }
          return
        }
      }
    }
  }

  private advanceGuards(): void {
    const toRemove: string[] = []

    for (const guard of this.state.guards) {
      if (guard.patrolPath.length < 2) {
        toRemove.push(guard.id)
        continue
      }

      const target = guard.patrolPath[guard.patrolIndex]
      const dx = target.x - guard.x
      const dy = target.y - guard.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= BASE_MOVE_SPEED) {
        // Reached waypoint — snap and advance
        guard.x = target.x
        guard.y = target.y
        const nextIndex = guard.patrolIndex + 1
        if (nextIndex >= guard.patrolPath.length) {
          // Completed full patrol — despawn
          toRemove.push(guard.id)
        } else {
          guard.patrolIndex = nextIndex
        }
      } else {
        guard.x += (dx / dist) * BASE_MOVE_SPEED
        guard.y += (dy / dist) * BASE_MOVE_SPEED
      }
    }

    if (toRemove.length > 0) {
      this.state.guards = this.state.guards.filter(g => !toRemove.includes(g.id))
    }
  }
}
