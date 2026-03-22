/**
 * MapRenderer.ts — Draws the tile-based map onto a canvas context.
 *
 * Coordinate system: tile (col, row) → pixel (col*TILE, row*TILE).
 * Rooms are rendered as floor areas; everything outside rooms is wall.
 */
import type { MapDef } from '@heist/shared'
import type { Door } from '@heist/shared'

export const TILE = 32 // pixels per tile

const COLOR_WALL    = '#0a0a14'
const COLOR_FLOOR   = '#0f1520'
const COLOR_DOOR_OPEN   = '#1a3a1a'
const COLOR_DOOR_LOCKED = '#8b0000'
const COLOR_GRID    = 'rgba(0,207,255,0.04)'
const COLOR_ROOM_BORDER = 'rgba(0,207,255,0.15)'

/**
 * Build a quick floor-tile lookup from the map definition.
 * Returns a Set of "col,row" strings that are floor tiles.
 */
function buildFloorSet(map: MapDef): Set<string> {
  const set = new Set<string>()
  for (const room of map.rooms) {
    for (let row = room.y; row < room.y + room.height; row++) {
      for (let col = room.x; col < room.x + room.width; col++) {
        set.add(`${col},${row}`)
      }
    }
  }
  return set
}

export class MapRenderer {
  private floorSet: Set<string>

  constructor(private map: MapDef) {
    this.floorSet = buildFloorSet(map)
  }

  get pixelWidth(): number  { return this.map.width  * TILE }
  get pixelHeight(): number { return this.map.height * TILE }

  isFloor(col: number, row: number): boolean {
    return this.floorSet.has(`${col},${row}`)
  }

  draw(ctx: CanvasRenderingContext2D, doors: Door[]): void {
    const { width, height } = this.map

    // ── Background (all walls) ──────────────────────────────────────────────
    ctx.fillStyle = COLOR_WALL
    ctx.fillRect(0, 0, width * TILE, height * TILE)

    // ── Floor tiles ─────────────────────────────────────────────────────────
    ctx.fillStyle = COLOR_FLOOR
    for (const room of this.map.rooms) {
      ctx.fillRect(room.x * TILE, room.y * TILE, room.width * TILE, room.height * TILE)
    }

    // ── Grid overlay (subtle) ────────────────────────────────────────────────
    ctx.strokeStyle = COLOR_GRID
    ctx.lineWidth = 0.5
    for (let col = 0; col <= width; col++) {
      ctx.beginPath()
      ctx.moveTo(col * TILE, 0)
      ctx.lineTo(col * TILE, height * TILE)
      ctx.stroke()
    }
    for (let row = 0; row <= height; row++) {
      ctx.beginPath()
      ctx.moveTo(0, row * TILE)
      ctx.lineTo(width * TILE, row * TILE)
      ctx.stroke()
    }

    // ── Room borders ─────────────────────────────────────────────────────────
    ctx.strokeStyle = COLOR_ROOM_BORDER
    ctx.lineWidth = 1
    for (const room of this.map.rooms) {
      ctx.strokeRect(room.x * TILE, room.y * TILE, room.width * TILE, room.height * TILE)
    }

    // ── Doors ────────────────────────────────────────────────────────────────
    for (const door of doors) {
      ctx.fillStyle = door.locked ? COLOR_DOOR_LOCKED : COLOR_DOOR_OPEN
      ctx.fillRect(door.x * TILE + 4, door.y * TILE + 4, TILE - 8, TILE - 8)
      ctx.strokeStyle = door.locked ? '#ff4444' : '#44ff44'
      ctx.lineWidth = 1.5
      ctx.strokeRect(door.x * TILE + 4, door.y * TILE + 4, TILE - 8, TILE - 8)
    }
  }
}
