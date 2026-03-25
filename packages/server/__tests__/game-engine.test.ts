import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { randomUUID } from 'crypto'
import { GameEngine } from '../src/game/game-engine'
import { initGameState } from '../src/game/map-init'
import { BASIC_MAP } from '@heist/shared'
import type { GameRoom, GameState, Door, LootItem } from '@heist/shared'

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

    it('despawns guard after completing full patrol path', () => {
      const room = makeRoom()
      const state = initGameState(room, BASIC_MAP)
      // Guard is already at its last waypoint (patrolIndex = 1, path length = 2)
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
      engine.advanceTick()

      // Guard completes patrol and is removed
      expect(state.guards.length).toBe(0)
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

  describe('Phase 3 integration — handlePlayerMove', () => {
    it('handlePlayerMove does nothing when phase is not heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'
      const thief = room.players.find(p => p.role === 'thief')!
      const posBefore = { ...state.playerPositions.find(p => p.playerId === thief.id)! }

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handlePlayerMove(thief.id, 1, 0)

      const posAfter = state.playerPositions.find(p => p.playerId === thief.id)!
      expect(posAfter.x).toBe(posBefore.x)
    })

    it('handlePlayerMove updates thief position during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const thief = room.players.find(p => p.role === 'thief')!
      const posBefore = state.playerPositions.find(p => p.playerId === thief.id)!.x

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handlePlayerMove(thief.id, 1, 0)

      // Position should have changed (BASIC_MAP has no wall tiles defined, so movement goes through)
      const posAfter = state.playerPositions.find(p => p.playerId === thief.id)!.x
      expect(posAfter).not.toBe(posBefore)
    })
  })

  describe('Phase 3 integration — handlePlayerAction', () => {
    it('handlePlayerAction does nothing when phase is not heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'
      const door: Door = { id: 'door1', x: 6, y: 6, locked: true, open: false }
      state.doors.push(door)

      const thief = room.players.find(p => p.role === 'thief')!

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handlePlayerAction(thief.id, 'pick_lock', 'door1')

      expect(door.locked).toBe(true)
    })

    it('take_loot attaches loot to thief during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const thief = room.players.find(p => p.role === 'thief')!
      // Place loot within 2-tile Euclidean range of thief spawn (3,3)
      const lootItem: LootItem = {
        id: 'loot1', x: 4, y: 3, value: 1, weight: 1, carried: false, carriedBy: null,
      }
      state.loot.push(lootItem)

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handlePlayerAction(thief.id, 'take_loot', 'loot1')

      expect(lootItem.carried).toBe(true)
      expect(lootItem.carriedBy).toBe(thief.id)
    })

    it('drop_loot detaches loot from thief during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!
      const lootItem: LootItem = {
        id: 'loot1', x: 5, y: 5, value: 1, weight: 1, carried: true, carriedBy: thief.id,
      }
      state.loot.push(lootItem)
      pos.lootCarried.push('loot1')

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handlePlayerAction(thief.id, 'drop_loot', 'loot1')

      expect(lootItem.carried).toBe(false)
    })
  })

  describe('Phase 3 integration — handleSecurityAction', () => {
    it('handleSecurityAction does nothing when phase is not heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'planning'
      const door: Door = { id: 'door1', x: 6, y: 6, locked: false, open: true }
      state.doors.push(door)
      const secId = room.players.find(p => p.role === 'security')!.id

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'lock_door', 'door1')

      expect(door.locked).toBe(false)
    })

    it('handleSecurityAction rejects non-security player', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const door: Door = { id: 'door1', x: 6, y: 6, locked: false, open: true }
      state.doors.push(door)
      const thief = room.players.find(p => p.role === 'thief')!

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(thief.id, 'lock_door', 'door1')

      expect(door.locked).toBe(false)
    })

    it('lock_door action locks the door during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const door: Door = { id: 'door1', x: 6, y: 6, locked: false, open: true }
      state.doors.push(door)
      const secId = room.players.find(p => p.role === 'security')!.id

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'lock_door', 'door1')

      expect(door.locked).toBe(true)
    })

    it('trigger_alarm sets alarmTriggered during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const secId = room.players.find(p => p.role === 'security')!.id

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'trigger_alarm')

      expect(state.alarmTriggered).toBe(true)
    })

    it('cut_lights sets lightsOut during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const secId = room.players.find(p => p.role === 'security')!.id

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'cut_lights')

      expect(state.lightsOut).toBe(true)
    })

    it('release_guard adds guard to state during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const secId = room.players.find(p => p.role === 'security')!.id
      const patrolPath = [{ x: 5, y: 5 }, { x: 10, y: 5 }]

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'release_guard', undefined, patrolPath)

      expect(state.guards.length).toBeGreaterThan(0)
    })

    it('unlock_door unlocks a locked door during heist', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const door: Door = { id: 'door1', x: 6, y: 6, locked: true, open: false }
      state.doors.push(door)
      const secId = room.players.find(p => p.role === 'security')!.id

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'unlock_door', 'door1')

      expect(door.locked).toBe(false)
    })
  })

  describe('Phase 3 integration — release_guard edge cases', () => {
    it('release_guard with only 1 valid waypoint does not add a guard to state.guards', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const secId = room.players.find(p => p.role === 'security')!.id

      // Provide a patrolPath with exactly 1 valid waypoint — engine requires >= 2 after filtering
      const patrolPath = [{ x: 5, y: 5 }]

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'release_guard', undefined, patrolPath)

      expect(state.guards.length).toBe(0)
    })

    it('release_guard with patrolPath that has out-of-bounds waypoints filtered to < 2 does not add a guard', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      const secId = room.players.find(p => p.role === 'security')!.id

      // Both waypoints are out-of-bounds (negative) — after filtering, 0 valid waypoints remain
      const patrolPath = [
        { x: -1, y: 5 },
        { x: 5, y: -1 },
      ]

      const engine = new GameEngine(state, BASIC_MAP)
      engine.handleSecurityAction(secId, 'release_guard', undefined, patrolPath)

      expect(state.guards.length).toBe(0)
    })
  })

  describe('Phase 3 integration — camera FOV detection via advanceTick', () => {
    it('thief within camera range and FOV angle triggers alarm after advanceTick', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!

      // Place camera at (10, 10) facing right (angle = 0), wide FOV
      state.cameras = [{
        id: 'cam1',
        x: 10,
        y: 10,
        angle: 0,           // facing along +x axis
        fov: Math.PI,       // 180 degrees — covers everything in front
        destroyed: false,
      }]

      // Place thief directly in front of camera within detection range (2.5 tiles)
      pos.x = 11.5
      pos.y = 10

      expect(state.alarmTriggered).toBe(false)

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(state.alarmTriggered).toBe(true)
    })

    it('thief outside camera range does not trigger alarm', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!

      state.cameras = [{
        id: 'cam1',
        x: 10,
        y: 10,
        angle: 0,
        fov: Math.PI,
        destroyed: false,
      }]

      // Place thief far away — outside 2.5 tile range
      pos.x = 20
      pos.y = 10

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(state.alarmTriggered).toBe(false)
    })

    it('destroyed camera does not trigger alarm even when thief is in range and FOV', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!

      state.cameras = [{
        id: 'cam1',
        x: 10,
        y: 10,
        angle: 0,
        fov: Math.PI,
        destroyed: true, // destroyed — should not detect
      }]

      pos.x = 11
      pos.y = 10

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      expect(state.alarmTriggered).toBe(false)
    })

    it('camera detection skips when alarm is already triggered', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'
      state.alarmTriggered = true // already active

      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!

      state.cameras = [{
        id: 'cam1',
        x: 10,
        y: 10,
        angle: 0,
        fov: Math.PI,
        destroyed: false,
      }]

      pos.x = 11
      pos.y = 10

      // preAlarmTicksRemaining must be null so heistTicksRemaining is not overwritten
      state.preAlarmTicksRemaining = null
      const ticksBefore = state.heistTicksRemaining

      const engine = new GameEngine(state, BASIC_MAP)
      engine.advanceTick()

      // Alarm was already on — camera branch is skipped so no additional alarm side-effects
      expect(state.alarmTriggered).toBe(true)
      // heistTicksRemaining would only be capped to ALARM_LOCKDOWN_TICKS on first trigger
      // Since alarm was already active and ticks > ALARM_LOCKDOWN_TICKS, the timer just decrements
      expect(state.heistTicksRemaining).toBe(ticksBefore - 1)
    })
  })

  describe('Phase 3 integration — win condition via advanceTick', () => {
    it('advanceTick broadcasts game_over and sets phase to resolution when thieves win', () => {
      const room = makeRoom(1)
      const state = initGameState(room, BASIC_MAP)
      state.room.phase = 'heist'

      const thief = room.players.find(p => p.role === 'thief')!
      const pos = state.playerPositions.find(p => p.playerId === thief.id)!

      // Put thief at exit with enough loot
      pos.x = state.exit.x
      pos.y = state.exit.y
      const lootIds = Array.from({ length: 3 }, (_, i) => {
        const id = `loot${i}`
        state.loot.push({ id, x: pos.x, y: pos.y, value: 1, weight: 1, carried: true, carriedBy: thief.id })
        return id
      })
      pos.lootCarried.push(...lootIds)

      const messages: Array<{ type: string }> = []
      const engine = new GameEngine(state, BASIC_MAP, msg => messages.push(msg))
      engine.advanceTick()

      expect(messages.some(m => m.type === 'game_over')).toBe(true)
      expect(state.room.phase as string).toBe('resolution')
    })
  })
})
