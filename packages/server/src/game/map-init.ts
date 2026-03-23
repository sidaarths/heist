import { randomUUID } from 'crypto'
import type {
  GameRoom, GameState, LootItem, AlarmPanel, Camera, Door,
  ExitPoint, PlayerPosition,
} from '@heist/shared'
import type { MapDef, MapRoom } from '@heist/shared'
import {
  LOOT_COUNT_MIN,
  LOOT_COUNT_MAX,
  ALARM_PANEL_COUNT_MIN,
  ALARM_PANEL_COUNT_MAX,
  HEIST_DURATION_TICKS,
} from '@heist/shared'

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Pick random floor tiles from within the specified rooms,
 * avoiding already-occupied positions.
 */
function pickFloorTiles(
  rooms: MapRoom[],
  roomIds: string[],
  count: number,
  occupied: Set<string>,
): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = []
  for (const room of rooms) {
    if (!roomIds.includes(room.id)) continue
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        const key = `${x},${y}`
        if (!occupied.has(key)) candidates.push({ x, y })
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const picked = candidates.slice(0, Math.min(count, candidates.length))
  for (const t of picked) occupied.add(`${t.x},${t.y}`)
  return picked
}

export function initGameState(room: GameRoom, map: MapDef): GameState {
  const occupied = new Set<string>()

  // Reserve spawn points
  for (const sp of map.spawnPoints.security) occupied.add(`${sp.x},${sp.y}`)
  for (const sp of map.spawnPoints.thieves)  occupied.add(`${sp.x},${sp.y}`)

  // Fixed exit from map definition
  const exit: ExitPoint = { ...map.exitPosition }
  occupied.add(`${exit.x},${exit.y}`)

  // Fixed cameras from map definition
  const cameras: Camera[] = map.cameraDefs.map(c => ({
    id: c.id,
    x: c.x,
    y: c.y,
    angle: c.angle,
    fov: c.fov,
    destroyed: false,
  }))
  for (const c of cameras) occupied.add(`${c.x},${c.y}`)

  // Fixed doors from map definition
  const doors: Door[] = map.doorDefs.map(d => ({
    id: d.id,
    x: d.x,
    y: d.y,
    locked: d.initiallyLocked,
    open: !d.initiallyLocked,
  }))
  for (const d of doors) occupied.add(`${d.x},${d.y}`)

  // Loot placed randomly within designated rooms only
  const lootCount = randInt(LOOT_COUNT_MIN, LOOT_COUNT_MAX)
  const lootTiles = pickFloorTiles(map.rooms, map.lootRoomIds, lootCount, occupied)
  const loot: LootItem[] = lootTiles.map(tile => ({
    id: randomUUID(),
    x: tile.x,
    y: tile.y,
    value: randInt(1, 3),
    weight: 1,
    carried: false,
    carriedBy: null,
  }))

  // Alarm panels placed randomly within designated rooms only
  const panelCount = randInt(ALARM_PANEL_COUNT_MIN, ALARM_PANEL_COUNT_MAX)
  const panelTiles = pickFloorTiles(map.rooms, map.alarmRoomIds, panelCount, occupied)
  const alarmPanels: AlarmPanel[] = panelTiles.map(tile => ({
    id: randomUUID(),
    x: tile.x,
    y: tile.y,
    disabled: false,
    triggered: false,
  }))

  // Player positions from spawn points
  const thieves        = room.players.filter(p => p.role === 'thief')
  const securityPlayer = room.players.find(p => p.role === 'security')
  const playerPositions: PlayerPosition[] = []

  if (securityPlayer) {
    const sp = map.spawnPoints.security[0]
    playerPositions.push({
      playerId: securityPlayer.id,
      x: sp.x, y: sp.y,
      frozen: false, frozenTicksRemaining: 0,
      lootCarried: [],
    })
  }

  thieves.forEach((thief, i) => {
    const sp = map.spawnPoints.thieves[i % map.spawnPoints.thieves.length]
    playerPositions.push({
      playerId: thief.id,
      x: sp.x, y: sp.y,
      frozen: false, frozenTicksRemaining: 0,
      lootCarried: [],
    })
  })

  return {
    room,
    mapId: map.id,
    loot,
    doors,
    cameras,
    alarmPanels,
    guards: [],
    playerPositions,
    exit,
    tick: 0,
    alarmTriggered: false,
    heistTicksRemaining: HEIST_DURATION_TICKS,
    preAlarmTicksRemaining: null,
    lightsOut: false,
    lightsOutRemainingTicks: 0,
  }
}
