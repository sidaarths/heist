import type { GameState } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import { TileType } from '@heist/shared'
import { BASE_MOVE_SPEED, LOOT_SPEED_PENALTY } from '@heist/shared'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Determine the TileType at a given (x, y) position in the map.
 * Returns TileType.Wall if the position is outside all rooms.
 */
function getTileAt(map: MapDef, x: number, y: number): TileType {
  const tx = Math.floor(x)
  const ty = Math.floor(y)

  for (const room of map.rooms) {
    if (
      tx >= room.x &&
      tx < room.x + room.width &&
      ty >= room.y &&
      ty < room.y + room.height
    ) {
      const localX = tx - room.x
      const localY = ty - room.y
      if (room.tiles && room.tiles[localY] && room.tiles[localY][localX] !== undefined) {
        return room.tiles[localY][localX]
      }
      return TileType.Floor
    }
  }

  return TileType.Wall
}

/**
 * Apply a player move command, validating against walls and doors.
 *
 * Wall tiles block movement unless there is an unlocked door at that tile.
 * Locked doors also block movement (player must pick the lock first).
 */
export function applyPlayerMove(
  state: GameState,
  map: MapDef,
  playerId: string,
  dx: number,
  dy: number,
): void {
  const pos = state.playerPositions.find(p => p.playerId === playerId)
  if (!pos) return

  if (pos.frozen) return

  const cdx = clamp(dx, -1, 1)
  const cdy = clamp(dy, -1, 1)

  let speed = BASE_MOVE_SPEED
  for (let i = 0; i < pos.lootCarried.length; i++) {
    speed *= LOOT_SPEED_PENALTY
  }

  const newX = pos.x + cdx * speed
  const newY = pos.y + cdy * speed

  const tile = getTileAt(map, newX, newY)
  if (tile === TileType.Wall) {
    // Check for a door in this gap tile — unlocked doors are passable
    const tx = Math.floor(newX)
    const ty = Math.floor(newY)
    const door = state.doors.find(d => d.x === tx && d.y === ty)
    if (!door || door.locked) return // blocked: no door, or door is locked
    // Unlocked door — fall through to position update
  }

  pos.x = clamp(newX, 0, map.width - 1)
  pos.y = clamp(newY, 0, map.height - 1)
}
