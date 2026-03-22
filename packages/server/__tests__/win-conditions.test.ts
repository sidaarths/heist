import { describe, it, expect } from 'bun:test'
import { randomUUID } from 'crypto'
import { checkWinConditions } from '../src/game/win-conditions'
import type {
  GameState,
  GameRoom,
  PlayerPosition,
  LootItem,
  Door,
} from '@heist/shared'
import { LOOT_TO_WIN, LOCKDOWN_DURATION_MS, TICK_MS } from '@heist/shared'

function makeRoom(thiefIds: string[] = ['thief1', 'thief2']): GameRoom {
  return {
    id: 'ABCDEF',
    phase: 'heist',
    players: [
      { id: 'sec1', name: 'Security', role: 'security', ready: true, connected: true },
      ...thiefIds.map((id, i) => ({
        id,
        name: `Thief${i + 1}`,
        role: 'thief' as const,
        ready: true,
        connected: true,
      })),
    ],
    hostId: 'sec1',
    createdAt: Date.now(),
  }
}

const EXIT = { x: 20, y: 20 }

function makeState(overrides?: {
  playerPositions?: PlayerPosition[]
  loot?: LootItem[]
  doors?: Door[]
  alarmTriggered?: boolean
  lockdownTicksRemaining?: number
  thiefIds?: string[]
}): GameState {
  const thiefIds = overrides?.thiefIds ?? ['thief1', 'thief2']
  return {
    room: makeRoom(thiefIds),
    loot: overrides?.loot ?? [],
    doors: overrides?.doors ?? [],
    cameras: [],
    alarmPanels: [],
    guards: [],
    playerPositions: overrides?.playerPositions ?? thiefIds.map(id => ({
      playerId: id,
      x: 5,
      y: 5,
      frozen: false,
      frozenTicksRemaining: 0,
      lootCarried: [],
    })).concat([
      { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
    ]),
    exit: EXIT,
    tick: 0,
    alarmTriggered: overrides?.alarmTriggered ?? false,
    lockdownTicksRemaining: overrides?.lockdownTicksRemaining ?? Math.floor(LOCKDOWN_DURATION_MS / TICK_MS),
    lightsOut: false,
    lightsOutRemainingTicks: 0,
  }
}

describe('win-conditions — thieves win', () => {
  it('returns null when no win condition is met', () => {
    const state = makeState()
    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })

  it('thieves win when thief at exit carrying loot and total escaped ≥ LOOT_TO_WIN', () => {
    const lootItems: LootItem[] = Array.from({ length: LOOT_TO_WIN }, (_, i) => ({
      id: `loot${i}`,
      x: EXIT.x,
      y: EXIT.y,
      value: 1,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }))

    const state = makeState({
      loot: lootItems,
      playerPositions: [
        { playerId: 'thief1', x: EXIT.x, y: EXIT.y, frozen: false, frozenTicksRemaining: 0, lootCarried: lootItems.map(l => l.id) },
        { playerId: 'thief2', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    const result = checkWinConditions(state)
    expect(result).not.toBeNull()
    expect(result!.winner).toBe('thieves')
  })

  it('thieves do NOT win when at exit but carrying fewer than LOOT_TO_WIN items', () => {
    const lootItems: LootItem[] = Array.from({ length: LOOT_TO_WIN - 1 }, (_, i) => ({
      id: `loot${i}`,
      x: EXIT.x,
      y: EXIT.y,
      value: 1,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }))

    const state = makeState({
      loot: lootItems,
      playerPositions: [
        { playerId: 'thief1', x: EXIT.x, y: EXIT.y, frozen: false, frozenTicksRemaining: 0, lootCarried: lootItems.map(l => l.id) },
        { playerId: 'thief2', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })

  it('thieves do NOT win when carrying enough loot but not at exit tile', () => {
    const lootItems: LootItem[] = Array.from({ length: LOOT_TO_WIN }, (_, i) => ({
      id: `loot${i}`,
      x: 5,
      y: 5,
      value: 1,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }))

    const state = makeState({
      loot: lootItems,
      playerPositions: [
        { playerId: 'thief1', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: lootItems.map(l => l.id) },
        { playerId: 'thief2', x: 10, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })
})

describe('win-conditions — security wins (lockdown)', () => {
  it('security wins when lockdown countdown reaches 0', () => {
    const state = makeState({
      alarmTriggered: true,
      lockdownTicksRemaining: 0,
    })

    const result = checkWinConditions(state)
    expect(result).not.toBeNull()
    expect(result!.winner).toBe('security')
    expect(result!.reason).toMatch(/lockdown/i)
  })

  it('security does NOT win when lockdown is active but countdown > 0', () => {
    const state = makeState({
      alarmTriggered: true,
      lockdownTicksRemaining: 100,
    })

    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })

  it('security does NOT win on countdown=0 if alarm was never triggered', () => {
    // lockdownTicksRemaining starts at full value; reaching 0 only matters if alarm triggered
    const state = makeState({
      alarmTriggered: false,
      lockdownTicksRemaining: 0,
    })

    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })
})

describe('win-conditions — no trap condition', () => {
  it('security does NOT win just because thieves are near locked doors', () => {
    // Thieves surrounded by locked doors can still pick locks — not a loss
    const door1: Door = { id: 'door1', x: 6, y: 5, locked: true, open: false }
    const door2: Door = { id: 'door2', x: 4, y: 5, locked: true, open: false }

    const state = makeState({
      doors: [door1, door2],
      playerPositions: [
        { playerId: 'thief1', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    const result = checkWinConditions(state)
    expect(result).toBeNull()
  })
})

describe('win-conditions — game_over broadcast', () => {
  it('returns a result object with winner and reason when thieves win', () => {
    const lootItems: LootItem[] = Array.from({ length: LOOT_TO_WIN }, (_, i) => ({
      id: `loot${i}`,
      x: EXIT.x,
      y: EXIT.y,
      value: 1,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }))

    const state = makeState({
      loot: lootItems,
      playerPositions: [
        { playerId: 'thief1', x: EXIT.x, y: EXIT.y, frozen: false, frozenTicksRemaining: 0, lootCarried: lootItems.map(l => l.id) },
        { playerId: 'thief2', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'sec1', x: 30, y: 30, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    const result = checkWinConditions(state)
    expect(result).not.toBeNull()
    expect(result!.winner).toBe('thieves')
    expect(typeof result!.reason).toBe('string')
    expect(result!.reason.length).toBeGreaterThan(0)
  })

  it('returns a result object with winner and reason when security wins via lockdown', () => {
    const state = makeState({ alarmTriggered: true, lockdownTicksRemaining: 0 })

    const result = checkWinConditions(state)
    expect(result).not.toBeNull()
    expect(result!.winner).toBe('security')
    expect(typeof result!.reason).toBe('string')
    expect(result!.reason.length).toBeGreaterThan(0)
  })
})
