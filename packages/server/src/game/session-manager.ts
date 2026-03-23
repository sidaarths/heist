import type { GameState, ServerMessage } from '@heist/shared'
import { getRandomMap, TICK_MS, THIEF_VISION_TILES } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import type { RoomManager } from '../lobby'
import { initGameState } from './map-init'
import { GameEngine } from './game-engine'

type BroadcastFn = (roomId: string, msg: ServerMessage) => void
type SendToPlayerFn = (playerId: string, msg: ServerMessage) => void

/**
 * Returns a shallow copy of game state with playerPositions filtered to what
 * the given player can see. Security sees all; thieves only see players within
 * their fog-of-war vision radius.
 */
function filterStateForPlayer(state: GameState, playerId: string): GameState {
  const player = state.room.players.find(p => p.id === playerId)
  if (!player || player.role === 'security') return state

  const myPos = state.playerPositions.find(p => p.playerId === playerId)
  if (!myPos) return state

  const visiblePositions = state.playerPositions.filter(pos => {
    if (pos.playerId === playerId) return true
    const dx = pos.x - myPos.x
    const dy = pos.y - myPos.y
    return Math.sqrt(dx * dx + dy * dy) <= THIEF_VISION_TILES
  })

  return { ...state, playerPositions: visiblePositions }
}

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
    private sendToPlayer?: SendToPlayerFn,
  ) {}

  /**
   * Called when a room is ready to start. Skips planning entirely —
   * picks a random map, initialises game state, sets phase to 'heist',
   * and broadcasts game_start immediately.
   */
  startGame(roomId: string): void {
    if (this.sessions.has(roomId)) return

    const room = this.manager.getRoom(roomId)
    if (!room) return

    const map = getRandomMap()
    const state = initGameState(room, map)

    // Create session placeholder first so onGameOver can reference it via stopRoom
    const session: Session = { engine: null!, state, map, timer: null }
    this.sessions.set(roomId, session)

    const engine = new GameEngine(
      state,
      map,
      (msg) => this.broadcast(roomId, msg),
      () => this.stopRoom(roomId), // clears the interval when game_over fires
    )
    session.engine = engine

    // Transition to heist immediately
    room.phase = 'heist'
    state.room.phase = 'heist'

    this.broadcast(roomId, { type: 'game_start', gameState: state })

    const timer = setInterval(() => {
      engine.advanceTick()
      // Send a per-player filtered view to prevent fog-of-war bypass via raw WS frames
      if (this.sendToPlayer) {
        for (const player of state.room.players) {
          this.sendToPlayer(player.id, {
            type: 'game_state_tick',
            gameState: filterStateForPlayer(state, player.id),
            tick: state.tick,
          })
        }
      } else {
        // Fallback for tests that don't provide sendToPlayer
        this.broadcast(roomId, { type: 'game_state_tick', gameState: state, tick: state.tick })
      }
    }, TICK_MS)

    session.timer = timer
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
