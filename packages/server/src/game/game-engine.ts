import type { GameState, ServerMessage } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import { BASE_MOVE_SPEED, REPLAY_BUFFER_MAX } from '@heist/shared'

type BroadcastFn = (msg: ServerMessage) => void

export class GameEngine {
  replayBuffer: GameState[] = []
  private broadcast: BroadcastFn

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
    this.state.tick++

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

  private advanceGuards(): void {
    for (const guard of this.state.guards) {
      if (guard.patrolPath.length < 2) continue

      const target = guard.patrolPath[guard.patrolIndex]
      const dx = target.x - guard.x
      const dy = target.y - guard.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= BASE_MOVE_SPEED) {
        // Reached waypoint — snap to it and advance index
        guard.x = target.x
        guard.y = target.y
        guard.patrolIndex = (guard.patrolIndex + 1) % guard.patrolPath.length
      } else {
        // Move toward waypoint
        guard.x += (dx / dist) * BASE_MOVE_SPEED
        guard.y += (dy / dist) * BASE_MOVE_SPEED
      }
    }
  }
}
