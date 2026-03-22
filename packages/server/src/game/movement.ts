import type { GameState } from '@heist/shared'
import type { MapDef } from '@heist/shared'
import { TileType } from '@heist/shared'
import { BASE_MOVE_SPEED, LOOT_SPEED_PENALTY } from '@heist/shared'

/**
 * Clamp a value to the range [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Determine the TileType at a given (x, y) position in the map.
 * Returns TileType.Wall if out-of-bounds or no tile data available for that room.
 */
function getTileAt(map: MapDef, x: number, y: number): TileType {
  // Floor to integer tile coordinates (floor = correct tile boundary)
  const tx = Math.floor(x)
  const ty = Math.floor(y)

  for (const room of map.rooms) {
    if (
      tx >= room.x &&
      tx < room.x + room.width &&
      ty >= room.y &&
      ty < room.y + room.height
    ) {
      // Tiles are indexed as tiles[row][col] = tiles[localY][localX]
      const localX = tx - room.x
      const localY = ty - room.y
      if (room.tiles && room.tiles[localY] && room.tiles[localY][localX] !== undefined) {
        return room.tiles[localY][localX]
      }
      // Room exists but no tile data — treat as floor (legacy maps)
      return TileType.Floor
    }
  }

  // Out of all rooms — treat as wall / out of bounds
  return TileType.Wall
}

/**
 * Apply a player move command, validating against walls and applying
 * speed modifiers (loot penalty, freeze gate).
 *
 * @param state  - mutable game state
 * @param map    - map definition used for wall collision
 * @param playerId - player initiating the move
 * @param dx     - horizontal direction, in range [-1, 1] (clamped server-side)
 * @param dy     - vertical direction, in range [-1, 1] (clamped server-side)
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

  // Frozen players cannot move
  if (pos.frozen) return

  // Clamp input to [-1, 1] to prevent client-side exploit
  const cdx = clamp(dx, -1, 1)
  const cdy = clamp(dy, -1, 1)

  // Apply loot speed penalty: multiply per item carried
  let speed = BASE_MOVE_SPEED
  for (let i = 0; i < pos.lootCarried.length; i++) {
    speed *= LOOT_SPEED_PENALTY
  }

  const newX = pos.x + cdx * speed
  const newY = pos.y + cdy * speed

  // Wall collision: check the destination tile
  const tile = getTileAt(map, newX, newY)
  if (tile === TileType.Wall) {
    return
  }

  pos.x = newX
  pos.y = newY
}
