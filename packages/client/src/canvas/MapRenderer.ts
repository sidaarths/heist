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
const COLOR_GRID    = 'rgba(0,207,255,0.04)'
const COLOR_ROOM_BORDER = 'rgba(0,207,255,0.15)'

// Door colors
const DOOR_FRAME        = '#6b4c11'
const DOOR_LOCKED_FILL  = 'rgba(120,0,0,0.7)'
const DOOR_LOCKED_GLOW  = '#cc2200'
const DOOR_OPEN_FILL    = 'rgba(0,60,0,0.4)'
const DOOR_OPEN_STROKE  = '#228822'

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
      this.drawDoor(ctx, door)
    }
  }

  private drawDoor(ctx: CanvasRenderingContext2D, door: Door): void {
    const x = door.x * TILE
    const y = door.y * TILE
    const cx = x + TILE / 2
    const cy = y + TILE / 2

    ctx.save()

    // Door fill
    ctx.fillStyle = door.locked ? DOOR_LOCKED_FILL : DOOR_OPEN_FILL
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6)

    // Door frame — thick brown border
    ctx.strokeStyle = DOOR_FRAME
    ctx.lineWidth = 3
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6)

    if (door.locked) {
      // Locked: red glow border + padlock icon
      ctx.strokeStyle = DOOR_LOCKED_GLOW
      ctx.lineWidth = 1.5
      ctx.shadowColor = DOOR_LOCKED_GLOW
      ctx.shadowBlur = 6
      ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6)
      ctx.shadowBlur = 0

      // Padlock shackle (arc on top)
      ctx.strokeStyle = '#ff8888'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy - 2, 4, Math.PI, 0)
      ctx.stroke()
      // Padlock body
      ctx.fillStyle = '#cc2200'
      ctx.fillRect(cx - 4, cy - 2, 8, 6)
      // Keyhole
      ctx.beginPath()
      ctx.arc(cx, cy + 1, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ff8888'
      ctx.fill()
    } else {
      // Open: subtle green, door-swing arc
      ctx.strokeStyle = DOOR_OPEN_STROKE
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x + 4, y + 4, TILE - 8, 0, Math.PI / 2)
      ctx.stroke()

      // "open" indicator — small green arrow
      ctx.fillStyle = DOOR_OPEN_STROKE
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('▸', cx, cy)
    }

    ctx.restore()
  }
}
