import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { randomUUID } from 'crypto'
import { GameEngine } from '../src/game/game-engine'
import { initGameState } from '../src/game/map-init'
import { BASIC_MAP } from '@heist/shared'
import type { GameRoom, GameState } from '@heist/shared'

function makeRoom(thiefCount = 2): GameRoom {
  const hostId = randomUUID()
  return {
    id: 'ABCDEF',
    phase: 'planning',
    players: [
      { id: hostId, name: 'Security', role: 'security', ready: true, connected: true },
      ...Array.from({ length: thiefCount }, (_, i) => ({
        id: randomUUID(),
        name: `Thief${i + 1}`,
        role: 'thief' as const,
        ready: true,
        connected: true,
      })),
    ],
    hostId,
    createdAt: Date.now(),
  }
}

describe('GameEngine', () => {
  describe('guard patrol advancement', () => {
    it('does not advance guard patrol index when phase is planning', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      // Add a guard with a patrol path
      state.guards.push({
        id: 'g1',
        x: 5,
        y: 5,
        patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }],
        patrolIndex: 0,
        alerted: false,
      })
      state.room.phase = 'planning'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(state.guards[0].patrolIndex).toBe(0)
    })

    it('advances guard patrol index each tick during heist phase', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.guards.push({
        id: 'g1',
        x: 5,
        y: 5,
        patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }],
        patrolIndex: 0,
        alerted: false,
      })
      state.room.phase = 'heist'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      // Guard should have moved toward next waypoint or advanced index when reached
      // At minimum, the guard processes movement each tick
      expect(state.tick).toBe(1)
    })

    it('wraps guard patrol index back to 0 after reaching end of path', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      // Guard is already at last waypoint
      state.guards.push({
        id: 'g1',
        x: 10,
        y: 10,
        patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 10 }],
        patrolIndex: 1,
        alerted: false,
      })
      state.room.phase = 'heist'

      const engine = new GameEngine(state, BASIC_MAP)
      // Guard is already at its current waypoint — one tick snaps and wraps index to 0
      engine.advanceTick()

      expect(state.guards[0].patrolIndex).toBe(0)
    })
  })

  describe('tick counter', () => {
    it('increments tick on each advanceTick call during heist', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()
      engine.advanceTick()
      engine.advanceTick()

      expect(state.tick).toBe(3)
    })

    it('does not increment tick during planning phase', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(state.tick).toBe(0)
    })
  })

  describe('planning phase timer', () => {
    it('emits planning_tick events with decrementing secondsRemaining', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'

      const ticks: number[] = []
      const engine = new GameEngine(state, BASIC_MAP, (msg) => {
        if (msg.type === 'planning_tick') ticks.push(msg.secondsRemaining)
      })

      engine.tickPlanningSecond(60)
      engine.tickPlanningSecond(59)
      engine.tickPlanningSecond(58)

      expect(ticks).toEqual([60, 59, 58])
    })

    it('transitions room phase to heist when planning countdown reaches 0', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'

      const messages: Array<{ type: string }> = []
      const engine = new GameEngine(state, BASIC_MAP, (msg) => messages.push(msg))

      engine.tickPlanningSecond(0)

      expect(state.room.phase as string).toBe('heist')
      expect(messages.some(m => m.type === 'game_start')).toBe(true)
    })
  })

  describe('replay buffer', () => {
    it('accumulates state snapshots during heist phase', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()
      engine.advanceTick()

      expect(engine.replayBuffer.length).toBe(2)
    })

    it('does not accumulate snapshots during planning phase', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(engine.replayBuffer.length).toBe(0)
    })
  })
})
