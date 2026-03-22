import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { randomUUID } from 'crypto'
import { RoomManager } from '../src/lobby'
import { GameSessionManager } from '../src/game/session-manager'
import type { ServerMessage } from '@heist/shared'

/** Fast-forward all pending timers using Bun's built-in fake timers. */
function useFakeTimers() {
  // Bun doesn't yet expose jest-style fake timers, so we use a manual approach:
  // replace setInterval/clearInterval with a controllable version for this module.
  const intervals: Map<number, { fn: () => void; ms: number }> = new Map()
  let nextId = 1

  const origSetInterval = globalThis.setInterval
  const origClearInterval = globalThis.clearInterval

  ;(globalThis as any).setInterval = (fn: () => void, ms: number) => {
    const id = nextId++
    intervals.set(id, { fn, ms })
    return id as unknown as ReturnType<typeof setInterval>
  }
  ;(globalThis as any).clearInterval = (id: unknown) => {
    intervals.delete(id as number)
  }

  return {
    /** Run every registered interval callback once. */
    tick() {
      for (const { fn } of intervals.values()) fn()
    },
    /** Run every registered interval callback N times. */
    tickN(n: number) {
      for (let i = 0; i < n; i++) this.tick()
    },
    activeCount() {
      return intervals.size
    },
    restore() {
      ;(globalThis as any).setInterval = origSetInterval
      ;(globalThis as any).clearInterval = origClearInterval
    },
  }
}

/** Set up a minimal 2-player room in planning phase. */
function makePlanningRoom(manager: RoomManager) {
  const hostId = randomUUID()
  const guestId = randomUUID()

  const r1 = manager.createRoom('Host', hostId)
  if ('error' in r1) throw new Error(r1.error)
  const { room } = r1

  const r2 = manager.joinRoom(room.id, 'Guest', guestId)
  if ('error' in r2) throw new Error(r2.error)

  manager.selectRole(room.id, hostId, 'security')
  manager.selectRole(room.id, guestId, 'thief')
  manager.setReady(room.id, hostId, true)
  manager.setReady(room.id, guestId, true)

  const started = manager.startGame(room.id, hostId)
  if ('error' in started) throw new Error((started as any).error)

  return { room, hostId, guestId }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GameSessionManager', () => {
  let manager: RoomManager
  let broadcasts: Array<{ roomId: string; msg: ServerMessage }>
  let sessions: GameSessionManager
  let timers: ReturnType<typeof useFakeTimers>

  beforeEach(() => {
    timers = useFakeTimers()
    manager = new RoomManager()
    broadcasts = []
    sessions = new GameSessionManager(manager, (roomId, msg) => {
      broadcasts.push({ roomId, msg })
    })
  })

  afterEach(() => {
    timers.restore()
  })

  // ─── startPlanning ──────────────────────────────────────────────────────────

  describe('startPlanning', () => {
    it('registers the session after starting', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)
      expect(sessions.getSession(room.id)).toBeDefined()
    })

    it('is idempotent — calling twice does not create a second session', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)
      sessions.startPlanning(room.id)
      expect(timers.activeCount()).toBe(1)
    })

    it('does nothing for an unknown roomId', () => {
      sessions.startPlanning('DOES-NOT-EXIST')
      expect(sessions.getSession('DOES-NOT-EXIST')).toBeUndefined()
      expect(timers.activeCount()).toBe(0)
    })

    it('does nothing if room phase is not planning', () => {
      const r = manager.createRoom('Alice', randomUUID())
      if ('error' in r) throw new Error()
      // Room is still in lobby phase
      sessions.startPlanning(r.room.id)
      expect(sessions.getSession(r.room.id)).toBeUndefined()
    })

    it('broadcasts planning_tick on each interval tick', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)

      timers.tick()

      const ticks = broadcasts.filter(b => b.msg.type === 'planning_tick')
      expect(ticks.length).toBeGreaterThan(0)
      expect(ticks[0].roomId).toBe(room.id)
    })

    it('planning_tick secondsRemaining decrements with each tick', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)

      timers.tick()
      const first = (broadcasts.at(-1)!.msg as any).secondsRemaining as number

      timers.tick()
      const second = (broadcasts.at(-1)!.msg as any).secondsRemaining as number

      expect(second).toBe(first - 1)
    })
  })

  // ─── startHeist (via countdown reaching 0) ──────────────────────────────────

  describe('startHeist (via countdown)', () => {
    it('transitions room phase to heist when countdown reaches 0', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)

      // The planning timer counts from totalSeconds → 0 then calls startHeist.
      // Each tick decrements secondsRemaining by 1 after broadcasting.
      // After PLANNING_DURATION_MS/1000 + 1 ticks the heist timer fires.
      const totalSeconds = 60
      timers.tickN(totalSeconds + 1)

      const r = manager.getRoom(room.id)
      expect(r?.phase).toBe('heist')
    })

    it('broadcasts game_start when countdown reaches 0', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)

      timers.tickN(61)

      const gameStart = broadcasts.find(b => b.msg.type === 'game_start')
      expect(gameStart).toBeDefined()
      expect(gameStart!.roomId).toBe(room.id)
    })

    it('starts heist tick loop after countdown completes', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)

      // Complete planning countdown
      timers.tickN(61)
      const broadcastCountBefore = broadcasts.length

      // Tick the heist loop once
      timers.tick()

      const heistTicks = broadcasts
        .slice(broadcastCountBefore)
        .filter(b => b.msg.type === 'game_state_tick')
      expect(heistTicks.length).toBeGreaterThan(0)
    })
  })

  // ─── stopRoom ───────────────────────────────────────────────────────────────

  describe('stopRoom', () => {
    it('removes the session', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)
      sessions.stopRoom(room.id)
      expect(sessions.getSession(room.id)).toBeUndefined()
    })

    it('clears the active timer', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)
      expect(timers.activeCount()).toBe(1)

      sessions.stopRoom(room.id)
      expect(timers.activeCount()).toBe(0)
    })

    it('is safe to call for an unknown roomId', () => {
      expect(() => sessions.stopRoom('NO-ROOM')).not.toThrow()
    })

    it('stops broadcasting after stopRoom', () => {
      const { room } = makePlanningRoom(manager)
      sessions.startPlanning(room.id)
      sessions.stopRoom(room.id)

      const before = broadcasts.length
      timers.tickN(5)
      expect(broadcasts.length).toBe(before)
    })
  })
})
