import { describe, it, expect } from 'bun:test'
import { randomUUID } from 'crypto'
import {
  handleLockDoor,
  handleUnlockDoor,
  handleTriggerAlarm,
  handleCutLights,
  handleReleaseGuard,
  tickSecurityCooldowns,
  tickGuardCollisions,
  type SecurityCooldowns,
} from '../src/game/security-actions'
import type {
  GameState,
  GameRoom,
  Door,
  Guard,
  PlayerPosition,
} from '@heist/shared'
import {
  COOLDOWN_LOCK_DOOR_TICKS,
  CUT_LIGHTS_DURATION_TICKS,
  CUT_LIGHTS_MAX_USES,
  HEIST_DURATION_TICKS,
  ALARM_LOCKDOWN_TICKS,
  FREEZE_DURATION_TICKS,
  MAX_GUARDS_PER_ROOM,
} from '@heist/shared'

function makeRoom(): GameRoom {
  return {
    id: 'ABCDEF',
    phase: 'heist',
    players: [
      { id: 'sec1', name: 'Security', role: 'security', ready: true, connected: true },
      { id: 'thief1', name: 'Thief1', role: 'thief', ready: true, connected: true },
      { id: 'thief2', name: 'Thief2', role: 'thief', ready: true, connected: true },
    ],
    hostId: 'sec1',
    createdAt: Date.now(),
  }
}

function makeState(overrides?: {
  doors?: Door[]
  guards?: Guard[]
  playerPositions?: PlayerPosition[]
}): GameState {
  return {
    room: makeRoom(),
    loot: [],
    doors: overrides?.doors ?? [],
    cameras: [],
    alarmPanels: [],
    guards: overrides?.guards ?? [],
    playerPositions: overrides?.playerPositions ?? [
      { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      { playerId: 'thief1', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      { playerId: 'thief2', x: 10, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
    ],
    exit: { x: 30, y: 30 },
    tick: 0,
    alarmTriggered: false,
    heistTicksRemaining: HEIST_DURATION_TICKS,
    preAlarmTicksRemaining: null,
    lightsOut: false,
    lightsOutRemainingTicks: 0,
    cutLightsUsesRemaining: 3,
    mapId: 'test',
  }
}

// Cooldowns map: securityPlayerId → { action → ticksRemaining }
type Cooldowns = Map<string, Map<string, number>>

describe('security-actions — lock_door', () => {
  it('lock_door sets door.locked = true', () => {
    const door: Door = { id: 'door1', x: 10, y: 10, locked: false, open: true }
    const state = makeState({ doors: [door] })
    const cooldowns: Cooldowns = new Map()

    handleLockDoor(state, 'sec1', 'door1', cooldowns)

    expect(door.locked).toBe(true)
  })

  it('lock_door applies cooldown of COOLDOWN_LOCK_DOOR_TICKS', () => {
    const door: Door = { id: 'door1', x: 10, y: 10, locked: false, open: true }
    const state = makeState({ doors: [door] })
    const cooldowns: Cooldowns = new Map()

    handleLockDoor(state, 'sec1', 'door1', cooldowns)

    const secCooldowns = cooldowns.get('sec1')
    expect(secCooldowns).toBeDefined()
    expect(secCooldowns!.get('lock_door')).toBe(COOLDOWN_LOCK_DOOR_TICKS)
  })

  it('lock_door rejected while on cooldown', () => {
    const door1: Door = { id: 'door1', x: 10, y: 10, locked: false, open: true }
    const door2: Door = { id: 'door2', x: 12, y: 10, locked: false, open: true }
    const state = makeState({ doors: [door1, door2] })
    const cooldowns: Cooldowns = new Map()

    handleLockDoor(state, 'sec1', 'door1', cooldowns)
    handleLockDoor(state, 'sec1', 'door2', cooldowns)

    // door2 should remain unlocked because cooldown is active
    expect(door1.locked).toBe(true)
    expect(door2.locked).toBe(false)
  })

  it('lock_door on non-existent door does nothing', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()
    expect(() => handleLockDoor(state, 'sec1', 'nonexistent', cooldowns)).not.toThrow()
  })
})

describe('security-actions — unlock_door', () => {
  it('unlock_door sets door.locked = false', () => {
    const door: Door = { id: 'door1', x: 10, y: 10, locked: true, open: false }
    const state = makeState({ doors: [door] })
    const cooldowns: Cooldowns = new Map()

    handleUnlockDoor(state, 'sec1', 'door1', cooldowns)

    expect(door.locked).toBe(false)
  })

  it('unlock_door applies cooldown same as lock_door', () => {
    const door: Door = { id: 'door1', x: 10, y: 10, locked: true, open: false }
    const state = makeState({ doors: [door] })
    const cooldowns: Cooldowns = new Map()

    handleUnlockDoor(state, 'sec1', 'door1', cooldowns)

    const secCooldowns = cooldowns.get('sec1')
    expect(secCooldowns!.get('lock_door')).toBe(COOLDOWN_LOCK_DOOR_TICKS)
  })
})

describe('security-actions — trigger_alarm', () => {
  it('trigger_alarm sets alarmTriggered = true', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    handleTriggerAlarm(state, 'sec1', cooldowns)

    expect(state.alarmTriggered).toBe(true)
  })

  it('trigger_alarm caps heistTicksRemaining to ALARM_LOCKDOWN_TICKS if over 60s', () => {
    const state = makeState()
    state.heistTicksRemaining = HEIST_DURATION_TICKS
    const cooldowns: Cooldowns = new Map()

    handleTriggerAlarm(state, 'sec1', cooldowns)

    expect(state.heistTicksRemaining).toBe(ALARM_LOCKDOWN_TICKS)
    expect(state.preAlarmTicksRemaining).toBe(HEIST_DURATION_TICKS)
  })

  it('trigger_alarm does not change timer if already <= ALARM_LOCKDOWN_TICKS', () => {
    const state = makeState()
    state.heistTicksRemaining = 500 // already under 60s
    const cooldowns: Cooldowns = new Map()

    handleTriggerAlarm(state, 'sec1', cooldowns)

    expect(state.heistTicksRemaining).toBe(500) // unchanged
  })

  it('trigger_alarm cannot be triggered twice while already active', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    handleTriggerAlarm(state, 'sec1', cooldowns)
    state.heistTicksRemaining = 300 // simulate partial countdown
    handleTriggerAlarm(state, 'sec1', cooldowns)

    // Should not re-trigger; still 300
    expect(state.heistTicksRemaining).toBe(300)
  })
})

describe('security-actions — cut_lights', () => {
  it('cut_lights sets lightsOut = true', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    handleCutLights(state, 'sec1', cooldowns)

    expect(state.lightsOut).toBe(true)
  })

  it('cut_lights sets lightsOutRemainingTicks to CUT_LIGHTS_DURATION_TICKS', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    handleCutLights(state, 'sec1', cooldowns)

    expect(state.lightsOutRemainingTicks).toBe(CUT_LIGHTS_DURATION_TICKS)
  })

  it('lightsOut resets to false after CUT_LIGHTS_DURATION_TICKS ticks', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    handleCutLights(state, 'sec1', cooldowns)

    // Simulate ticks passing via tickSecurityCooldowns
    for (let i = 0; i < CUT_LIGHTS_DURATION_TICKS; i++) {
      tickSecurityCooldowns(state, cooldowns)
    }

    expect(state.lightsOut).toBe(false)
    expect(state.lightsOutRemainingTicks).toBe(0)
  })

  it('decrements cutLightsUsesRemaining on each successful use', () => {
    const state = makeState()
    const cooldowns: Cooldowns = new Map()

    expect(state.cutLightsUsesRemaining).toBe(CUT_LIGHTS_MAX_USES)
    handleCutLights(state, 'sec1', cooldowns)
    expect(state.cutLightsUsesRemaining).toBe(CUT_LIGHTS_MAX_USES - 1)
  })

  it('blocks cut_lights when cutLightsUsesRemaining is 0', () => {
    const state = makeState()
    state.cutLightsUsesRemaining = 0
    const cooldowns: Cooldowns = new Map()

    handleCutLights(state, 'sec1', cooldowns)

    expect(state.lightsOut).toBe(false)
    expect(state.cutLightsUsesRemaining).toBe(0)
  })

  it('allows exactly CUT_LIGHTS_MAX_USES uses then blocks', () => {
    const state = makeState()

    for (let use = 0; use < CUT_LIGHTS_MAX_USES; use++) {
      const cooldowns: Cooldowns = new Map() // fresh cooldown map each time
      // Reset lights between uses
      state.lightsOut = false
      handleCutLights(state, 'sec1', cooldowns)
      expect(state.lightsOut).toBe(true)
    }

    // One extra attempt — should be blocked
    state.lightsOut = false
    const cooldowns: Cooldowns = new Map()
    handleCutLights(state, 'sec1', cooldowns)
    expect(state.lightsOut).toBe(false)
    expect(state.cutLightsUsesRemaining).toBe(0)
  })
})

describe('security-actions — release_guard', () => {
  it('release_guard adds a guard to state.guards with given patrol path', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()
    const patrolPath = [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }]

    handleReleaseGuard(state, 'sec1', patrolPath, cooldowns)

    expect(state.guards.length).toBe(1)
    expect(state.guards[0].patrolPath).toEqual(patrolPath)
  })

  it('release_guard places guard at first waypoint of path', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()
    const patrolPath = [{ x: 7, y: 3 }, { x: 12, y: 3 }]

    handleReleaseGuard(state, 'sec1', patrolPath, cooldowns)

    expect(state.guards[0].x).toBe(7)
    expect(state.guards[0].y).toBe(3)
  })

  it('release_guard with empty path does not add a guard', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()

    handleReleaseGuard(state, 'sec1', [], cooldowns)

    expect(state.guards.length).toBe(0)
  })

  it('release_guard with single waypoint does not add a guard (need ≥ 2)', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()

    handleReleaseGuard(state, 'sec1', [{ x: 5, y: 5 }], cooldowns)

    expect(state.guards.length).toBe(0)
  })

  it('release_guard respects MAX_GUARDS_PER_ROOM cap', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()
    const patrolPath = [{ x: 5, y: 5 }, { x: 10, y: 5 }]

    // Fill up to the cap
    for (let i = 0; i < MAX_GUARDS_PER_ROOM; i++) {
      const fresh: SecurityCooldowns = new Map() // fresh cooldowns each call
      handleReleaseGuard(state, 'sec1', patrolPath, fresh)
    }
    expect(state.guards.length).toBe(MAX_GUARDS_PER_ROOM)

    // One more must be rejected
    const fresh: SecurityCooldowns = new Map()
    handleReleaseGuard(state, 'sec1', patrolPath, fresh)
    expect(state.guards.length).toBe(MAX_GUARDS_PER_ROOM)
  })

  it('release_guard applies cooldown — second call within cooldown is rejected', () => {
    const state = makeState()
    const cooldowns: SecurityCooldowns = new Map()
    const patrolPath = [{ x: 5, y: 5 }, { x: 10, y: 5 }]

    handleReleaseGuard(state, 'sec1', patrolPath, cooldowns)
    expect(state.guards.length).toBe(1)

    // Same cooldowns map — second call should be blocked
    handleReleaseGuard(state, 'sec1', patrolPath, cooldowns)
    expect(state.guards.length).toBe(1)
  })
})

describe('security-actions — guard collision (freeze mechanic)', () => {
  it('guard collision freezes thief for FREEZE_DURATION_TICKS', () => {
    const guard: Guard = {
      id: 'guard1',
      x: 5,
      y: 5,
      patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 5 }],
      patrolIndex: 0,
      alerted: false,
    }
    const state = makeState({
      guards: [guard],
      playerPositions: [
        { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'thief1', x: 5, y: 5, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    tickGuardCollisions(state)

    const thief = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(thief.frozen).toBe(true)
    expect(thief.frozenTicksRemaining).toBe(FREEZE_DURATION_TICKS)
  })

  it('guard collision does not freeze security player', () => {
    const guard: Guard = {
      id: 'guard1',
      x: 20,
      y: 20,
      patrolPath: [{ x: 20, y: 20 }, { x: 25, y: 20 }],
      patrolIndex: 0,
      alerted: false,
    }
    const state = makeState({ guards: [guard] })

    tickGuardCollisions(state)

    const secPos = state.playerPositions.find(p => p.playerId === 'sec1')!
    expect(secPos.frozen).toBe(false)
  })

  it('guard collision does not double-freeze an already-frozen thief', () => {
    const guard: Guard = {
      id: 'guard1',
      x: 5,
      y: 5,
      patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 5 }],
      patrolIndex: 0,
      alerted: false,
    }
    const state = makeState({
      guards: [guard],
      playerPositions: [
        { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'thief1', x: 5, y: 5, frozen: true, frozenTicksRemaining: 100, lootCarried: [] },
      ],
    })

    tickGuardCollisions(state)

    const thief = state.playerPositions.find(p => p.playerId === 'thief1')!
    // Should not reset — already frozen
    expect(thief.frozenTicksRemaining).toBe(FREEZE_DURATION_TICKS)
  })

  it('guard collision detection uses tile proximity (≤ 1 tile distance)', () => {
    const guard: Guard = {
      id: 'guard1',
      x: 5,
      y: 5,
      patrolPath: [{ x: 5, y: 5 }, { x: 10, y: 5 }],
      patrolIndex: 0,
      alerted: false,
    }
    const state = makeState({
      guards: [guard],
      playerPositions: [
        { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'thief1', x: 10, y: 10, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
      ],
    })

    tickGuardCollisions(state)

    const thief = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(thief.frozen).toBe(false)
  })

  it('frozen thief has frozenTicksRemaining decremented each tick via tickSecurityCooldowns', () => {
    const state = makeState({
      playerPositions: [
        { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'thief1', x: 5, y: 5, frozen: true, frozenTicksRemaining: 10, lootCarried: [] },
      ],
    })
    const cooldowns: Cooldowns = new Map()

    tickSecurityCooldowns(state, cooldowns)

    const thief = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(thief.frozenTicksRemaining).toBe(9)
  })

  it('frozen thief becomes unfrozen when frozenTicksRemaining reaches 0', () => {
    const state = makeState({
      playerPositions: [
        { playerId: 'sec1', x: 20, y: 20, frozen: false, frozenTicksRemaining: 0, lootCarried: [] },
        { playerId: 'thief1', x: 5, y: 5, frozen: true, frozenTicksRemaining: 1, lootCarried: [] },
      ],
    })
    const cooldowns: Cooldowns = new Map()

    tickSecurityCooldowns(state, cooldowns)

    const thief = state.playerPositions.find(p => p.playerId === 'thief1')!
    expect(thief.frozen).toBe(false)
    expect(thief.frozenTicksRemaining).toBe(0)
  })
})

describe('security-actions — tickSecurityCooldowns', () => {
  it('decrements lock_door cooldown each tick', () => {
    const door: Door = { id: 'door1', x: 10, y: 10, locked: false, open: true }
    const state = makeState({ doors: [door] })
    const cooldowns: Cooldowns = new Map()

    handleLockDoor(state, 'sec1', 'door1', cooldowns)
    const before = cooldowns.get('sec1')!.get('lock_door')!

    tickSecurityCooldowns(state, cooldowns)

    expect(cooldowns.get('sec1')!.get('lock_door')).toBe(before - 1)
  })

  it('removes cooldown entry when it reaches 0', () => {
    const cooldowns: Cooldowns = new Map()
    cooldowns.set('sec1', new Map([['lock_door', 1]]))
    const state = makeState()

    tickSecurityCooldowns(state, cooldowns)

    expect(cooldowns.get('sec1')!.has('lock_door')).toBe(false)
  })
})
