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
 * Player collision radius in tiles.
 * The leading-edge check uses this offset so the player sprite never visually
 * overlaps a wall tile.
 */
const PLAYER_RADIUS = 0.35

/**
 * Returns true if the given tile coordinate is passable (floor or unlocked door).
 */
function isPassable(map: MapDef, state: GameState, x: number, y: number): boolean {
  const tile = getTileAt(map, x, y)
  if (tile !== TileType.Wall) return true
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  const door = state.doors.find(d => d.x === tx && d.y === ty)
  return !!door && !door.locked
}

/**
 * Apply a player move command, validating against walls and doors.
 *
 * Wall tiles block movement unless there is an unlocked door at that tile.
 * Locked doors also block movement (player must pick the lock first).
 *
 * Collision is checked at the player's center AND at the leading edge offset
 * by PLAYER_RADIUS in the direction of movement, so the player sprite never
 * visually clips into wall tiles.
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

  // Check center tile
  if (!isPassable(map, state, newX, newY)) return

  // Check leading-edge points to prevent visual clipping into walls
  if (cdx !== 0 && !isPassable(map, state, newX + Math.sign(cdx) * PLAYER_RADIUS, newY)) return
  if (cdy !== 0 && !isPassable(map, state, newX, newY + Math.sign(cdy) * PLAYER_RADIUS)) return
  // Diagonal corner check: when moving diagonally, also probe the true corner
  if (cdx !== 0 && cdy !== 0 &&
      !isPassable(map, state, newX + Math.sign(cdx) * PLAYER_RADIUS, newY + Math.sign(cdy) * PLAYER_RADIUS)) return

  pos.x = clamp(newX, PLAYER_RADIUS, map.width - 1 - PLAYER_RADIUS)
  pos.y = clamp(newY, PLAYER_RADIUS, map.height - 1 - PLAYER_RADIUS)
}
