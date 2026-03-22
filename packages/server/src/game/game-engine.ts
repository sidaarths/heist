import type { GameState, ServerMessage } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import { BASE_MOVE_SPEED, REPLAY_BUFFER_MAX } from '@heist/shared'
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

  /** Active thief interactions (pick lock, destroy camera, disable alarm) */
  private interactions: InteractionMap = new Map()
  /** Security cooldowns per player */
  private cooldowns: SecurityCooldowns = new Map()

  constructor(
    private state: GameState,
    private map: MapDef,
    broadcast: BroadcastFn = () => {}
  ) {
    this.broadcast = broadcast
  }

  advanceTick(): void {
    if (this.state.room.phase !== 'heist') return

    this.advanceGuards()
    tickGuardCollisions(this.state)
    tickInteractions(this.state, this.interactions)
    tickSecurityCooldowns(this.state, this.cooldowns)

    this.state.tick++

    // Check win conditions after every state update
    const result = checkWinConditions(this.state)
    if (result) {
      this.state.room.phase = 'resolution'
      this.broadcast({ type: 'game_over', winner: result.winner, reason: result.reason })
    }

    // Bounded replay buffer — keep only the last REPLAY_BUFFER_MAX snapshots
    if (this.replayBuffer.length >= REPLAY_BUFFER_MAX) {
      this.replayBuffer.shift()
    }
    this.replayBuffer.push(structuredClone(this.state))
  }

  tickPlanningSecond(secondsRemaining: number): void {
    this.broadcast({ type: 'planning_tick', secondsRemaining })

    if (secondsRemaining === 0) {
      this.state.room.phase = 'heist'
      this.broadcast({ type: 'game_start', gameState: this.state })
    }
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
        if (patrolPath) handleReleaseGuard(this.state, playerId, patrolPath)
        break
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
