import { describe, it, expect } from 'bun:test'
import { randomUUID } from 'crypto'
import { initGameState } from '../src/game/map-init'
import { BASIC_MAP } from '@heist/shared'
import {
  LOOT_COUNT_MIN,
  LOOT_COUNT_MAX,
  ALARM_PANEL_COUNT_MIN,
  ALARM_PANEL_COUNT_MAX,
} from '@heist/shared'
import type { GameRoom } from '@heist/shared'

function makeRoom(thiefCount: number): GameRoom {
  const hostId = randomUUID()
  const players = [
    { id: hostId, name: 'Security', role: 'security' as const, ready: true, connected: true },
    ...Array.from({ length: thiefCount }, (_, i) => ({
      id: randomUUID(),
      name: `Thief${i + 1}`,
      role: 'thief' as const,
      ready: true,
      connected: true,
    })),
  ]
  return {
    id: 'ABCDEF',
    phase: 'planning',
    players,
    hostId,
    createdAt: Date.now(),
  }
}

describe('initGameState', () => {
  it('loot count is within [LOOT_COUNT_MIN, LOOT_COUNT_MAX]', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    expect(state.loot.length).toBeGreaterThanOrEqual(LOOT_COUNT_MIN)
    expect(state.loot.length).toBeLessThanOrEqual(LOOT_COUNT_MAX)
  })

  it('alarm panel count is within [ALARM_PANEL_COUNT_MIN, ALARM_PANEL_COUNT_MAX]', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    expect(state.alarmPanels.length).toBeGreaterThanOrEqual(ALARM_PANEL_COUNT_MIN)
    expect(state.alarmPanels.length).toBeLessThanOrEqual(ALARM_PANEL_COUNT_MAX)
  })

  it('all loot positions are within map bounds', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    for (const loot of state.loot) {
      expect(loot.x).toBeGreaterThanOrEqual(0)
      expect(loot.x).toBeLessThan(BASIC_MAP.width)
      expect(loot.y).toBeGreaterThanOrEqual(0)
      expect(loot.y).toBeLessThan(BASIC_MAP.height)
    }
  })

  it('all alarm panel positions are within map bounds', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    for (const panel of state.alarmPanels) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.x).toBeLessThan(BASIC_MAP.width)
      expect(panel.y).toBeGreaterThanOrEqual(0)
      expect(panel.y).toBeLessThan(BASIC_MAP.height)
    }
  })

  it('no two entities share the same tile', () => {
    const room = makeRoom(3)
    const state = initGameState(room, BASIC_MAP)
    const tiles = new Set<string>()
    const allEntities = [
      ...state.loot.map(l => `${l.x},${l.y}`),
      ...state.alarmPanels.map(p => `${p.x},${p.y}`),
      `${state.exit.x},${state.exit.y}`,
    ]
    for (const tile of allEntities) {
      expect(tiles.has(tile)).toBe(false)
      tiles.add(tile)
    }
  })

  it('assigns unique spawn points to each thief', () => {
    const room = makeRoom(3)
    const state = initGameState(room, BASIC_MAP)
    const thieves = room.players.filter(p => p.role === 'thief')
    const positions = thieves.map(t => {
      const pos = state.playerPositions.find(pp => pp.playerId === t.id)
      expect(pos).toBeDefined()
      return `${pos!.x},${pos!.y}`
    })
    const uniquePositions = new Set(positions)
    expect(uniquePositions.size).toBe(thieves.length)
  })

  it('all players start unfrozen at full speed', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    for (const pos of state.playerPositions) {
      expect(pos.frozen).toBe(false)
      expect(pos.frozenTicksRemaining).toBe(0)
      expect(pos.lootCarried).toHaveLength(0)
    }
  })

  it('starts with tick 0 and alarm not triggered', () => {
    const room = makeRoom(2)
    const state = initGameState(room, BASIC_MAP)
    expect(state.tick).toBe(0)
    expect(state.alarmTriggered).toBe(false)
    expect(state.lightsOut).toBe(false)
  })
})
