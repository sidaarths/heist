import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { randomUUID } from 'crypto'
import { RoomManager } from '../src/lobby'
import { GameSessionManager } from '../src/game/session-manager'
import type { ServerMessage } from '@heist/shared'

/** Replace setInterval/clearInterval with controllable fakes. */
function useFakeTimers() {
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
    tick() { for (const { fn } of intervals.values()) fn() },
    tickN(n: number) { for (let i = 0; i < n; i++) this.tick() },
    activeCount() { return intervals.size },
    restore() {
      ;(globalThis as any).setInterval = origSetInterval
      ;(globalThis as any).clearInterval = origClearInterval
    },
  }
}

/** Set up a minimal 2-player room transitioned to the planning phase. */
function makeReadyRoom(manager: RoomManager) {
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

  // ─── startGame ──────────────────────────────────────────────────────────────

  describe('startGame', () => {
    it('registers the session after starting', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      expect(sessions.getSession(room.id)).toBeDefined()
    })

    it('is idempotent — calling twice does not create a second session', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      sessions.startGame(room.id)
      expect(timers.activeCount()).toBe(1)
    })

    it('does nothing for an unknown roomId', () => {
      sessions.startGame('DOES-NOT-EXIST')
      expect(sessions.getSession('DOES-NOT-EXIST')).toBeUndefined()
      expect(timers.activeCount()).toBe(0)
    })

    it('broadcasts game_start immediately', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)

      const gameStart = broadcasts.find(b => b.msg.type === 'game_start')
      expect(gameStart).toBeDefined()
      expect(gameStart!.roomId).toBe(room.id)
    })

    it('transitions room phase to heist immediately', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)

      const r = manager.getRoom(room.id)
      expect(r?.phase).toBe('heist')
    })

    it('starts heist tick loop — broadcasts game_state_tick on each tick', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)

      const before = broadcasts.length
      timers.tick()

      const heistTicks = broadcasts
        .slice(before)
        .filter(b => b.msg.type === 'game_state_tick')
      expect(heistTicks.length).toBeGreaterThan(0)
    })
  })

  // ─── stopRoom ───────────────────────────────────────────────────────────────

  describe('stopRoom', () => {
    it('removes the session', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      sessions.stopRoom(room.id)
      expect(sessions.getSession(room.id)).toBeUndefined()
    })

    it('clears the active timer', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      expect(timers.activeCount()).toBe(1)

      sessions.stopRoom(room.id)
      expect(timers.activeCount()).toBe(0)
    })

    it('is safe to call for an unknown roomId', () => {
      expect(() => sessions.stopRoom('NO-ROOM')).not.toThrow()
    })

    it('stops broadcasting after stopRoom', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      sessions.stopRoom(room.id)

      const before = broadcasts.length
      timers.tickN(5)
      expect(broadcasts.length).toBe(before)
    })
  })
})
