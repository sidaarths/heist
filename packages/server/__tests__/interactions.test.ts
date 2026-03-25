import { describe, it, expect, beforeEach } from 'bun:test'
import { randomUUID } from 'crypto'
import {
  startInteraction,
  tickInteractions,
  handleTakeLoot,
  handleDropLoot,
} from '../src/game/interactions'
import type { GameState, GameRoom, PlayerPosition, Door, Camera, AlarmPanel, LootItem } from '@heist/shared'
import {
  PICK_LOCK_TICKS,
  DESTROY_CAMERA_TICKS,
  DISABLE_ALARM_TICKS,
  HEIST_DURATION_TICKS,
} from '@heist/shared'

function makeRoom(): GameRoom {
  return {
    id: 'ABCDEF',
    phase: 'heist',
    players: [
      { id: 'sec1', name: 'Security', role: 'security', ready: true, connected: true },
      { id: 'thief1', name: 'Thief1', role: 'thief', ready: true, connected: true },
    ],
    hostId: 'sec1',
    createdAt: Date.now(),
  }
}

function makePlayerPos(overrides?: Partial<PlayerPosition>): PlayerPosition {
  return {
    playerId: 'thief1',
    x: 5,
    y: 5,
    frozen: false,
    frozenTicksRemaining: 0,
    lootCarried: [],
    ...overrides,
  }
}

function makeBaseState(overrides?: {
  doors?: Door[]
  cameras?: Camera[]
  alarmPanels?: AlarmPanel[]
  loot?: LootItem[]
  playerPos?: Partial<PlayerPosition>
}): GameState {
  return {
    room: makeRoom(),
    loot: overrides?.loot ?? [],
    doors: overrides?.doors ?? [],
    cameras: overrides?.cameras ?? [],
    alarmPanels: overrides?.alarmPanels ?? [],
    guards: [],
    playerPositions: [makePlayerPos(overrides?.playerPos)],
    exit: { x: 10, y: 10 },
    tick: 0,
    alarmTriggered: false,
    heistTicksRemaining: HEIST_DURATION_TICKS,
    preAlarmTicksRemaining: null,
    lightsOut: false,
    lightsOutRemainingTicks: 0,
    mapId: 'test',
  }
}

// ─── Active interactions map: playerId → { targetId, type, ticksRemaining } ──
// The interactions module must export and manage this structure.

describe('interactions — pick_lock', () => {
  it('pick_lock starts a PICK_LOCK_TICKS countdown on the door interaction', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: true, open: false }
    const state = makeBaseState({ doors: [door] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)

    const active = interactions.get('thief1')
    expect(active).toBeDefined()
    expect(active.type).toBe('pick_lock')
    expect(active.targetId).toBe('door1')
    expect(active.ticksRemaining).toBe(PICK_LOCK_TICKS)
  })

  it('pick_lock cancels when player moves away', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: true, open: false }
    const state = makeBaseState({ doors: [door] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)
    expect(interactions.has('thief1')).toBe(true)

    // Simulate player moving (x changes)
    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    pos.x = 10
    tickInteractions(state, interactions)

    expect(interactions.has('thief1')).toBe(false)
  })

  it('pick_lock completes after PICK_LOCK_TICKS ticks → door.locked = false', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: true, open: false }
    const state = makeBaseState({ doors: [door] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)

    // Advance PICK_LOCK_TICKS - 1 ticks (not done yet)
    for (let i = 0; i < PICK_LOCK_TICKS - 1; i++) {
      tickInteractions(state, interactions)
    }
    expect(door.locked).toBe(true) // still locked

    // Final tick completes it
    tickInteractions(state, interactions)
    expect(door.locked).toBe(false)
    expect(interactions.has('thief1')).toBe(false)
  })

  it('pick_lock does nothing on a door that is already unlocked', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: false, open: false }
    const state = makeBaseState({ doors: [door] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)
    // Should not start interaction on already-unlocked door
    expect(interactions.has('thief1')).toBe(false)
  })
})

describe('interactions — destroy_camera', () => {
  it('destroy_camera starts a DESTROY_CAMERA_TICKS countdown', () => {
    const camera: Camera = { id: 'cam1', x: 5, y: 6, angle: 0, fov: 90, destroyed: false }
    const state = makeBaseState({ cameras: [camera] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'destroy_camera', 'cam1', interactions)

    const active = interactions.get('thief1')
    expect(active).toBeDefined()
    expect(active.type).toBe('destroy_camera')
    expect(active.ticksRemaining).toBe(DESTROY_CAMERA_TICKS)
  })

  it('destroy_camera completes → camera.destroyed = true', () => {
    const camera: Camera = { id: 'cam1', x: 5, y: 6, angle: 0, fov: 90, destroyed: false }
    const state = makeBaseState({ cameras: [camera] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'destroy_camera', 'cam1', interactions)

    for (let i = 0; i < DESTROY_CAMERA_TICKS; i++) {
      tickInteractions(state, interactions)
    }

    expect(camera.destroyed).toBe(true)
    expect(interactions.has('thief1')).toBe(false)
  })

  it('destroy_camera cancels if player moves away', () => {
    const camera: Camera = { id: 'cam1', x: 5, y: 6, angle: 0, fov: 90, destroyed: false }
    const state = makeBaseState({ cameras: [camera] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'destroy_camera', 'cam1', interactions)

    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    pos.x = 20
    tickInteractions(state, interactions)

    expect(camera.destroyed).toBe(false)
    expect(interactions.has('thief1')).toBe(false)
  })

  it('destroy_camera does nothing on an already-destroyed camera', () => {
    const camera: Camera = { id: 'cam1', x: 5, y: 6, angle: 0, fov: 90, destroyed: true }
    const state = makeBaseState({ cameras: [camera] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'destroy_camera', 'cam1', interactions)
    expect(interactions.has('thief1')).toBe(false)
  })
})

describe('interactions — disable_alarm', () => {
  it('disable_alarm starts a DISABLE_ALARM_TICKS countdown on a panel', () => {
    const panel: AlarmPanel = { id: 'panel1', x: 5, y: 6, disabled: false, triggered: false }
    const state = makeBaseState({ alarmPanels: [panel] })
    state.alarmTriggered = true
    const interactions = new Map()

    startInteraction(state, 'thief1', 'disable_alarm', 'panel1', interactions)

    const active = interactions.get('thief1')
    expect(active).toBeDefined()
    expect(active.ticksRemaining).toBe(DISABLE_ALARM_TICKS)
  })

  it('disable_alarm completes → alarmTriggered = false, restores heistTicksRemaining', () => {
    const panel: AlarmPanel = { id: 'panel1', x: 5, y: 6, disabled: false, triggered: false }
    const state = makeBaseState({ alarmPanels: [panel] })
    state.alarmTriggered = true
    state.heistTicksRemaining = 500
    state.preAlarmTicksRemaining = 3000 // saved pre-alarm value
    const interactions = new Map()

    startInteraction(state, 'thief1', 'disable_alarm', 'panel1', interactions)

    for (let i = 0; i < DISABLE_ALARM_TICKS; i++) {
      tickInteractions(state, interactions)
    }

    // elapsed = ALARM_LOCKDOWN_TICKS(1200) - heistTicksRemaining(500) = 700
    // restored = preAlarmTicksRemaining(3000) - elapsed(700) = 2300
    expect(state.alarmTriggered).toBe(false)
    expect(panel.disabled).toBe(true)
    expect(state.heistTicksRemaining).toBe(2300) // 3000 - 700 elapsed lockdown ticks
    expect(state.preAlarmTicksRemaining).toBeNull()
    expect(interactions.has('thief1')).toBe(false)
  })

  it('disable_alarm cancels if player moves away', () => {
    const panel: AlarmPanel = { id: 'panel1', x: 5, y: 6, disabled: false, triggered: false }
    const state = makeBaseState({ alarmPanels: [panel] })
    state.alarmTriggered = true
    const interactions = new Map()

    startInteraction(state, 'thief1', 'disable_alarm', 'panel1', interactions)

    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    pos.x = 20
    tickInteractions(state, interactions)

    expect(state.alarmTriggered).toBe(true)
    expect(interactions.has('thief1')).toBe(false)
  })
})

describe('interactions — take_loot', () => {
  it('take_loot sets loot.carried = true and loot.carriedBy = playerId', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: false,
      carriedBy: null,
    }
    const state = makeBaseState({ loot: [lootItem] })
    const interactions = new Map()

    handleTakeLoot(state, 'thief1', 'loot1')

    expect(lootItem.carried).toBe(true)
    expect(lootItem.carriedBy).toBe('thief1')
  })

  it('take_loot adds lootId to player lootCarried array', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: false,
      carriedBy: null,
    }
    const state = makeBaseState({ loot: [lootItem] })

    handleTakeLoot(state, 'thief1', 'loot1')

    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(pos.lootCarried).toContain('loot1')
  })

  it('take_loot on already-carried loot does not double-add', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: true,
      carriedBy: 'thief2',
    }
    const state = makeBaseState({ loot: [lootItem] })

    handleTakeLoot(state, 'thief1', 'loot1')

    // Should not transfer — loot is already carried
    expect(lootItem.carriedBy).toBe('thief2')
    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(pos.lootCarried).not.toContain('loot1')
  })
})

describe('interactions — drop_loot', () => {
  it('drop_loot sets loot.carried = false', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }
    const state = makeBaseState({
      loot: [lootItem],
      playerPos: { x: 7, y: 8, lootCarried: ['loot1'] },
    })

    handleDropLoot(state, 'thief1', 'loot1')

    expect(lootItem.carried).toBe(false)
    expect(lootItem.carriedBy).toBeNull()
  })

  it('drop_loot places loot at player current position', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }
    const state = makeBaseState({
      loot: [lootItem],
      playerPos: { x: 7, y: 8, lootCarried: ['loot1'] },
    })

    handleDropLoot(state, 'thief1', 'loot1')

    expect(lootItem.x).toBe(7)
    expect(lootItem.y).toBe(8)
  })

  it('drop_loot removes lootId from player lootCarried', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: true,
      carriedBy: 'thief1',
    }
    const state = makeBaseState({
      loot: [lootItem],
      playerPos: { x: 7, y: 8, lootCarried: ['loot1'] },
    })

    handleDropLoot(state, 'thief1', 'loot1')

    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(pos.lootCarried).not.toContain('loot1')
  })

  it('drop_loot on loot not carried by player does nothing', () => {
    const lootItem: LootItem = {
      id: 'loot1',
      x: 5,
      y: 5,
      value: 2,
      weight: 1,
      carried: true,
      carriedBy: 'thief2',
    }
    const state = makeBaseState({ loot: [lootItem] })

    handleDropLoot(state, 'thief1', 'loot1')

    expect(lootItem.carried).toBe(true)
    expect(lootItem.carriedBy).toBe('thief2')
  })
})

// ─── tickInteractions — missing/frozen player branches ────────────────────────

describe('tickInteractions — edge cases', () => {
  it('cancels interaction when player position is not found in state', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: true, open: false }
    const state = makeBaseState({ doors: [door] })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)
    expect(interactions.has('thief1')).toBe(true)

    // Remove the player position from state to simulate a ghost interaction
    state.playerPositions = []

    tickInteractions(state, interactions)

    // Interaction should be cleaned up
    expect(interactions.has('thief1')).toBe(false)
  })

  it('cancels interaction when player becomes frozen mid-progress', () => {
    const door: Door = { id: 'door1', x: 5, y: 6, locked: true, open: false }
    const state = makeBaseState({ doors: [door], playerPos: { frozen: false } })
    const interactions = new Map()

    startInteraction(state, 'thief1', 'pick_lock', 'door1', interactions)
    expect(interactions.has('thief1')).toBe(true)

    // Freeze the player mid-interaction
    const pos = state.playerPositions.find(p => p.playerId === 'thief1')!
    pos.frozen = true

    tickInteractions(state, interactions)

    // Interaction should be cancelled due to freeze
    expect(interactions.has('thief1')).toBe(false)
    // Door must remain locked
    expect(door.locked).toBe(true)
  })
})
