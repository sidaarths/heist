import { randomUUID } from 'crypto'
import type { GameRoom, GameState, LootItem, AlarmPanel, Camera, ExitPoint, PlayerPosition } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import {
  LOOT_COUNT_MIN,
  LOOT_COUNT_MAX,
  ALARM_PANEL_COUNT_MIN,
  ALARM_PANEL_COUNT_MAX,
  BASE_MOVE_SPEED,
  LOCKDOWN_DURATION_MS,
  TICK_MS,
} from '@heist/shared'

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickUniqueTiles(
  count: number,
  mapWidth: number,
  mapHeight: number,
  occupied: Set<string>
): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = []
  let attempts = 0
  const maxAttempts = count * 100

  while (tiles.length < count && attempts < maxAttempts) {
    attempts++
    const x = randInt(0, mapWidth - 1)
    const y = randInt(0, mapHeight - 1)
    const key = `${x},${y}`
    if (!occupied.has(key)) {
      occupied.add(key)
      tiles.push({ x, y })
    }
  }

  return tiles
}

export function initGameState(room: GameRoom, map: MapDef): GameState {
  const occupied = new Set<string>()

  // Reserve spawn points
  for (const sp of map.spawnPoints.security) occupied.add(`${sp.x},${sp.y}`)
  for (const sp of map.spawnPoints.thieves) occupied.add(`${sp.x},${sp.y}`)

  // Place exit
  const [exitTile] = pickUniqueTiles(1, map.width, map.height, occupied)
  const exit: ExitPoint = exitTile

  // Place loot
  const lootCount = randInt(LOOT_COUNT_MIN, LOOT_COUNT_MAX)
  const lootTiles = pickUniqueTiles(lootCount, map.width, map.height, occupied)
  const loot: LootItem[] = lootTiles.map(tile => ({
    id: randomUUID(),
    x: tile.x,
    y: tile.y,
    value: randInt(1, 3),
    weight: 1,
    carried: false,
    carriedBy: null,
  }))

  // Place alarm panels
  const panelCount = randInt(ALARM_PANEL_COUNT_MIN, ALARM_PANEL_COUNT_MAX)
  const panelTiles = pickUniqueTiles(panelCount, map.width, map.height, occupied)
  const alarmPanels: AlarmPanel[] = panelTiles.map(tile => ({
    id: randomUUID(),
    x: tile.x,
    y: tile.y,
    disabled: false,
    triggered: false,
  }))

  // Place cameras at fixed positions (from map definition) with randomised angles
  const cameras: Camera[] = map.rooms.map((r, i) => ({
    id: `cam-${i}`,
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
    angle: Math.random() * 360,
    fov: 90,
    destroyed: false,
  }))

  // Assign player positions
  const thieves = room.players.filter(p => p.role === 'thief')
  const securityPlayer = room.players.find(p => p.role === 'security')

  const playerPositions: PlayerPosition[] = []

  if (securityPlayer) {
    const sp = map.spawnPoints.security[0]
    playerPositions.push({
      playerId: securityPlayer.id,
      x: sp.x,
      y: sp.y,
      frozen: false,
      frozenTicksRemaining: 0,
      lootCarried: [],
    })
  }

  thieves.forEach((thief, i) => {
    const sp = map.spawnPoints.thieves[i % map.spawnPoints.thieves.length]
    playerPositions.push({
      playerId: thief.id,
      x: sp.x,
      y: sp.y,
      frozen: false,
      frozenTicksRemaining: 0,
      lootCarried: [],
    })
  })

  const lockdownTicks = Math.floor(LOCKDOWN_DURATION_MS / TICK_MS)

  return {
    room,
    loot,
    doors: [],
    cameras,
    alarmPanels,
    guards: [],
    playerPositions,
    exit,
    tick: 0,
    alarmTriggered: false,
    lockdownTicksRemaining: lockdownTicks,
    lightsOut: false,
    lightsOutRemainingTicks: 0,
  }
}
