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

  // ─── stopInterval ────────────────────────────────────────────────────────────

  describe('stopInterval', () => {
    it('clears the timer but keeps the session entry', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      expect(timers.activeCount()).toBe(1)

      sessions.stopInterval(room.id)

      expect(timers.activeCount()).toBe(0)
      expect(sessions.getSession(room.id)).toBeDefined()
    })

    it('is safe to call for an unknown roomId', () => {
      expect(() => sessions.stopInterval('NO-ROOM')).not.toThrow()
    })
  })

  // ─── getReplayBuffer ─────────────────────────────────────────────────────────

  describe('getReplayBuffer', () => {
    it('returns an empty array for an unknown room', () => {
      expect(sessions.getReplayBuffer('NO-ROOM')).toEqual([])
    })

    it('returns the engine replay buffer after ticks', () => {
      const { room } = makeReadyRoom(manager)
      sessions.startGame(room.id)
      timers.tickN(3)

      const buf = sessions.getReplayBuffer(room.id)
      expect(buf.length).toBe(3)
    })
  })

  // ─── sendReplay ──────────────────────────────────────────────────────────────

  describe('sendReplay', () => {
    it('sends replay_data to the player via sendToPlayer', () => {
      const sent: Array<{ playerId: string; msg: ServerMessage }> = []
      const sm = new GameSessionManager(
        manager,
        (roomId, msg) => broadcasts.push({ roomId, msg }),
        (playerId, msg) => sent.push({ playerId, msg }),
      )

      const { room, hostId } = makeReadyRoom(manager)
      sm.startGame(room.id)
      timers.tickN(2)

      sm.sendReplay(room.id, hostId)

      const replayMsg = sent.find(s => s.playerId === hostId && s.msg.type === 'replay_data')
      expect(replayMsg).toBeDefined()
    })

    it('is idempotent — repeated calls send only one message', () => {
      const sent: Array<{ playerId: string; msg: ServerMessage }> = []
      const sm = new GameSessionManager(
        manager,
        (roomId, msg) => broadcasts.push({ roomId, msg }),
        (playerId, msg) => sent.push({ playerId, msg }),
      )

      const { room, hostId } = makeReadyRoom(manager)
      sm.startGame(room.id)
      timers.tickN(2)

      sm.sendReplay(room.id, hostId)
      sm.sendReplay(room.id, hostId)
      sm.sendReplay(room.id, hostId)

      const replayMsgs = sent.filter(s => s.playerId === hostId && s.msg.type === 'replay_data')
      expect(replayMsgs.length).toBe(1)
    })

    it('does nothing when sendToPlayer is not provided', () => {
      const { room, hostId } = makeReadyRoom(manager)
      sessions.startGame(room.id) // sessions has no sendToPlayer
      timers.tickN(2)

      // Should not throw
      expect(() => sessions.sendReplay(room.id, hostId)).not.toThrow()
    })
  })

  // ─── filterStateForPlayer (via per-player tick broadcast) ────────────────────

  describe('per-player fog-of-war filtering', () => {
    it('security player receives all player positions', () => {
      const perPlayerSent: Array<{ playerId: string; msg: ServerMessage }> = []
      const sm = new GameSessionManager(
        manager,
        (roomId, msg) => broadcasts.push({ roomId, msg }),
        (playerId, msg) => perPlayerSent.push({ playerId, msg }),
      )

      const { room, hostId } = makeReadyRoom(manager)
      sm.startGame(room.id)

      // hostId is security — place guest far away (>THIEF_VISION_TILES)
      const session = sm.getSession(room.id)!
      const { guestId } = makeReadyRoom(manager) // we just need an ID
      // Move guest position far from host in state
      for (const pos of session.state.playerPositions) {
        if (pos.playerId !== hostId) {
          pos.x = 999
          pos.y = 999
        }
      }

      timers.tick()

      const secTick = perPlayerSent.find(
        s => s.playerId === hostId && s.msg.type === 'game_state_tick',
      )
      expect(secTick).toBeDefined()
      // Security sees all positions including distant ones
      const gameState = (secTick!.msg as Extract<ServerMessage, { type: 'game_state_tick' }>).gameState
      expect(gameState.playerPositions.length).toBe(session.state.playerPositions.length)
    })
  })
})
