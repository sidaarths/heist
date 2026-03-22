import type { GameState, ServerMessage } from '@heist/shared'
import { getRandomMap, PLANNING_DURATION_MS, TICK_MS } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { initGameState } from './map-init'
import { GameEngine } from './game-engine'

type BroadcastFn = (roomId: string, msg: ServerMessage) => void

interface Session {
  engine: GameEngine
  state: GameState
  map: MapDef
  timer: ReturnType<typeof setInterval> | null
}

export class GameSessionManager {
  private sessions: Map<string, Session> = new Map()

  constructor(
    private manager: RoomManager,
    private broadcast: BroadcastFn,
  ) {}

  /**
   * Called when a room transitions to 'planning'. Picks a random map,
   * initialises game state, and broadcasts planning_start so all clients
   * can see the map layout during planning.
   */
  startPlanning(roomId: string): void {
    if (this.sessions.has(roomId)) return

    const room = this.manager.getRoom(roomId)
    if (!room || room.phase !== 'planning') return

    const map = getRandomMap()
    const state = initGameState(room, map)

    const engine = new GameEngine(state, map, (msg) =>
      this.broadcast(roomId, msg),
    )

    // Send full game state immediately so clients see the map during planning
    this.broadcast(roomId, { type: 'planning_start', gameState: state })

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

    const session: Session = { engine, state, map, timer }
    this.sessions.set(roomId, session)
  }

  private startHeist(roomId: string): void {
    const session = this.sessions.get(roomId)
    if (!session) return

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
