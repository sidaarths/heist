import type { GameState, ServerMessage } from '@heist/shared'
import { BASIC_MAP, PLANNING_DURATION_MS, TICK_MS } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { initGameState } from './map-init'
import { GameEngine } from './game-engine'

type BroadcastFn = (roomId: string, msg: ServerMessage) => void

interface Session {
  engine: GameEngine
  state: GameState
  timer: ReturnType<typeof setInterval> | null
}

export class GameSessionManager {
  private sessions: Map<string, Session> = new Map()

  constructor(
    private manager: RoomManager,
    private broadcast: BroadcastFn,
  ) {}

  /**
   * Called when a room transitions to 'planning'. Initialises game state,
   * creates the engine, and starts the 1s planning countdown.
   */
  startPlanning(roomId: string): void {
    if (this.sessions.has(roomId)) return

    const room = this.manager.getRoom(roomId)
    if (!room || room.phase !== 'planning') return

    const state = initGameState(room, BASIC_MAP)

    const engine = new GameEngine(state, BASIC_MAP, (msg) =>
      this.broadcast(roomId, msg),
    )

    const totalSeconds = Math.floor(PLANNING_DURATION_MS / 1000)
    let secondsRemaining = totalSeconds

    const timer = setInterval(() => {
      engine.tickPlanningSecond(secondsRemaining)

      if (secondsRemaining === 0) {
        clearInterval(timer)
        session.timer = null
        this.startHeist(roomId)
      } else {
        secondsRemaining--
      }
    }, 1000)

    const session: Session = { engine, state, timer }
    this.sessions.set(roomId, session)
  }

  /**
   * Called when planning countdown reaches 0. Starts the 20 tps heist tick loop.
   */
  private startHeist(roomId: string): void {
    const session = this.sessions.get(roomId)
    if (!session) return

    // Sync room phase on the manager's room object
    const room = this.manager.getRoom(roomId)
    if (room) room.phase = 'heist'
    session.state.room.phase = 'heist'

    session.timer = setInterval(() => {
      session.engine.advanceTick()
      this.broadcast(roomId, {
        type: 'game_state_tick',
        gameState: session.state,
        tick: session.state.tick,
      })
    }, TICK_MS)
  }

  stopRoom(roomId: string): void {
    const session = this.sessions.get(roomId)
    if (!session) return
    if (session.timer) clearInterval(session.timer)
    this.sessions.delete(roomId)
  }

  getSession(roomId: string): Session | undefined {
    return this.sessions.get(roomId)
  }
}
