import { describe, it, expect, beforeEach } from 'bun:test'
import { randomUUID } from 'crypto'
import { applyPlayerMove } from '../src/game/movement'
import type { GameState, GameRoom, PlayerPosition, LootItem } from '@heist/shared'
import {
  BASE_MOVE_SPEED,
  LOOT_SPEED_PENALTY,
  FREEZE_DURATION_TICKS,
} from '@heist/shared'
import { TileType } from '@heist/shared'
import type { MapDef } from '@heist/shared'

// A 12×12 map with walls only on the outer border so players have room to move.
// BASE_MOVE_SPEED=3, so a player at x=1 moving right lands at x=4, which must be floor.
// Layout: walls at edges (row/col 0 and 11), floor everywhere inside.
function makeTestMap(): MapDef {
  const W = TileType.Wall
  const F = TileType.Floor
  const SIZE = 12
  const tiles: TileType[][] = []
  for (let row = 0; row < SIZE; row++) {
    const rowTiles: TileType[] = []
    for (let col = 0; col < SIZE; col++) {
      rowTiles.push(row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1 ? W : F)
    }
    tiles.push(rowTiles)
  }
  return {
    id: 'test',
    name: 'Test',
    width: SIZE,
    height: SIZE,
    rooms: [
      {
        id: 'room1',
        name: 'Room1',
        x: 0,
        y: 0,
        width: SIZE,
        height: SIZE,
        tiles,
      },
    ],
    spawnPoints: {
      security: [{ x: 5, y: 5 }],
      thieves: [{ x: 3, y: 3 }],
    },
    doorDefs: [],
    cameraDefs: [],
    exitPosition: { x: 5, y: 5 },
    lootRoomIds: [],
    alarmRoomIds: [],
  }
}

function makeRoom(): GameRoom {
  const hostId = randomUUID()
  return {
    id: 'ABCDEF',
    phase: 'heist',
    players: [
      { id: hostId, name: 'Security', role: 'security', ready: true, connected: true },
      { id: 'thief1', name: 'Thief1', role: 'thief', ready: true, connected: true },
    ],
    hostId,
    createdAt: Date.now(),
  }
}

function makeState(overrides?: Partial<PlayerPosition>): GameState {
  const room = makeRoom()
  const pos: PlayerPosition = {
    playerId: 'thief1',
    x: 2,
    y: 2,
    frozen: false,
    frozenTicksRemaining: 0,
    lootCarried: [],
    ...overrides,
  }
  return {
    room,
    loot: [],
    doors: [],
    cameras: [],
    alarmPanels: [],
    guards: [],
    playerPositions: [pos],
    exit: { x: 3, y: 3 },
    tick: 0,
    alarmTriggered: false,
    heistTicksRemaining: 6000,
    preAlarmTicksRemaining: null,
    lightsOut: false,
    lightsOutRemainingTicks: 0,
    cutLightsUsesRemaining: 3,
    mapId: 'test',
  }
}

describe('movement — applyPlayerMove', () => {
  describe('wall collision', () => {
    it('player cannot move into a wall tile', () => {
      const map = makeTestMap()
      // At x=1, moving left by BASE_MOVE_SPEED=3 lands at x=-2 (out of bounds = wall)
      const state = makeState({ x: 1, y: 5 })
      applyPlayerMove(state, map, 'thief1', -1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      // Position must stay at or above 1 — move was blocked
      expect(pos.x).toBeGreaterThanOrEqual(1)
    })

    it('player cannot move into top wall tile', () => {
      const map = makeTestMap()
      // At y=1, moving up by 3 lands at y=-2 (wall)
      const state = makeState({ x: 5, y: 1 })
      applyPlayerMove(state, map, 'thief1', 0, -1)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.y).toBeGreaterThanOrEqual(1)
    })
  })

  describe('valid movement', () => {
    it('player can move to adjacent floor tile', () => {
      const map = makeTestMap()
      // Start at (5,5) — center of 12×12 map; moving right is unobstructed
      const state = makeState({ x: 5, y: 5 })
      const before = { ...state.playerPositions[0] }
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.x).toBeGreaterThan(before.x)
    })

    it('player position updates correctly moving right (+x)', () => {
      const map = makeTestMap()
      // 5 + 3 = 8, which is floor (walls at 0 and 11)
      const state = makeState({ x: 5, y: 5 })
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.x).toBeCloseTo(5 + BASE_MOVE_SPEED, 5)
    })

    it('player position updates correctly moving left (-x)', () => {
      const map = makeTestMap()
      // 5 - 3 = 2, which is floor
      const state = makeState({ x: 5, y: 5 })
      applyPlayerMove(state, map, 'thief1', -1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.x).toBeCloseTo(5 - BASE_MOVE_SPEED, 5)
    })

    it('player position updates correctly moving down (+y)', () => {
      const map = makeTestMap()
      // 5 + 3 = 8, which is floor
      const state = makeState({ x: 5, y: 5 })
      applyPlayerMove(state, map, 'thief1', 0, 1)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.y).toBeCloseTo(5 + BASE_MOVE_SPEED, 5)
    })

    it('player position updates correctly moving up (-y)', () => {
      const map = makeTestMap()
      // 5 - 3 = 2, which is floor
      const state = makeState({ x: 5, y: 5 })
      applyPlayerMove(state, map, 'thief1', 0, -1)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.y).toBeCloseTo(5 - BASE_MOVE_SPEED, 5)
    })
  })

  describe('loot speed penalty', () => {
    it('loot speed penalty applied when carrying one item (speed * 0.7)', () => {
      const map = makeTestMap()
      const lootId = randomUUID()
      // 5 + 3*0.7 = 7.1, still floor
      const state = makeState({ x: 5, y: 5, lootCarried: [lootId] })
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      const expectedSpeed = BASE_MOVE_SPEED * LOOT_SPEED_PENALTY
      expect(pos.x).toBeCloseTo(5 + expectedSpeed, 5)
    })

    it('loot speed penalty stacks for multiple items', () => {
      const map = makeTestMap()
      const state = makeState({ x: 5, y: 5, lootCarried: [randomUUID(), randomUUID()] })
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      // Two items: speed * 0.7 * 0.7 = speed * 0.49
      const expectedSpeed = BASE_MOVE_SPEED * LOOT_SPEED_PENALTY * LOOT_SPEED_PENALTY
      expect(pos.x).toBeCloseTo(5 + expectedSpeed, 5)
    })
  })

  describe('frozen player', () => {
    it('frozen player ignores move commands — position unchanged', () => {
      const map = makeTestMap()
      const state = makeState({ x: 5, y: 5, frozen: true, frozenTicksRemaining: FREEZE_DURATION_TICKS })
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.x).toBe(5)
      expect(pos.y).toBe(5)
    })

    it('frozen player with 0 remaining ticks can move', () => {
      const map = makeTestMap()
      const state = makeState({ x: 5, y: 5, frozen: false, frozenTicksRemaining: 0 })
      applyPlayerMove(state, map, 'thief1', 1, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.x).toBeGreaterThan(5)
    })
  })

  describe('input clamping', () => {
    it('dx clamped to [-1, 1] — extreme dx does not teleport player', () => {
      const map = makeTestMap()
      const state = makeState({ x: 5, y: 5 })
      // dx=100 should be treated as dx=1
      applyPlayerMove(state, map, 'thief1', 100, 0)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      // Should not have moved beyond what speed * 1 allows
      expect(pos.x - 5).toBeLessThanOrEqual(BASE_MOVE_SPEED + 0.001)
    })

    it('dy clamped to [-1, 1] — extreme dy does not teleport player', () => {
      const map = makeTestMap()
      const state = makeState({ x: 5, y: 5 })
      applyPlayerMove(state, map, 'thief1', 0, 100)
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      expect(pos.y - 5).toBeLessThanOrEqual(BASE_MOVE_SPEED + 0.001)
    })
  })

  describe('unknown player', () => {
    it('silently ignores move for unknown playerId', () => {
      const map = makeTestMap()
      const state = makeState()
      // Should not throw
      expect(() => applyPlayerMove(state, map, 'unknown-id', 1, 0)).not.toThrow()
    })
  })

  describe('getTileAt — out-of-bounds tile', () => {
    it('treats coordinates outside all map rooms as wall (blocks movement)', () => {
      // Build a map whose single room covers only 4×4 tiles at offset (2,2)
      const smallMap: MapDef = {
        id: 'small',
        name: 'Small',
        width: 10,
        height: 10,
        rooms: [
          {
            id: 'r1',
            name: 'R1',
            x: 2,
            y: 2,
            width: 4,
            height: 4,
            tiles: Array.from({ length: 4 }, () =>
              Array(4).fill(TileType.Floor),
            ),
          },
        ],
        spawnPoints: { security: [{ x: 3, y: 3 }], thieves: [{ x: 4, y: 4 }] },
        doorDefs: [],
        cameraDefs: [],
        exitPosition: { x: 4, y: 4 },
        lootRoomIds: [],
        alarmRoomIds: [],
      }

      const state = makeState()
      // Place thief at (3,3) which is inside the room
      const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
      pos.x = 3
      pos.y = 3

      // Moving left to x=3-speed lands at ~2.75 which is inside room → allowed
      // Moving far left (dx=-1 many times) eventually exits the room bounding box
      // We simulate by placing thief right at the left edge of the room (x=2)
      // and trying to move left into tile x=1 which is outside all rooms → wall
      pos.x = 2.01
      pos.y = 3

      const beforeX = pos.x
      applyPlayerMove(state, smallMap, 'thief1', -1, 0)
      // Player should NOT move into the out-of-bounds wall tile
      expect(pos.x).toBeCloseTo(beforeX, 2)
    })
  })
})
