/**
 * MapRenderer.ts — Draws the tile-based map onto a canvas context.
 *
 * Rooms are floor areas. Every tile outside all rooms is a wall.
 * Doors sit in 1-tile wall gaps between rooms and are drawn oriented
 * to match the passage direction (horizontal vs vertical wall).
 */
import type { MapDef } from '@heist/shared'
import type { Door } from '@heist/shared'

export const TILE = 32 // pixels per tile

const COLOR_WALL         = '#08090f'
const COLOR_WALL_MORTAR  = '#0e1020' // brick mortar lines
const COLOR_FLOOR        = '#0d1a13'
const COLOR_GRID         = 'rgba(0,207,255,0.03)'
const COLOR_ROOM_BORDER  = 'rgba(0,207,255,0.45)'
const COLOR_WALL_EDGE    = 'rgba(0,207,255,0.18)' // glow at wall-floor boundary

const DOOR_FRAME        = '#5c3a0a'
const DOOR_LOCKED_FILL  = 'rgba(100,0,0,0.85)'
const DOOR_LOCKED_GLOW  = '#dd2200'
const DOOR_OPEN_FILL    = 'rgba(0,50,0,0.75)'
const DOOR_OPEN_STROKE  = '#1a6622'

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

    // Background (all walls)
    ctx.fillStyle = COLOR_WALL
    ctx.fillRect(0, 0, width * TILE, height * TILE)

    // Brick wall texture — horizontal mortar lines every half-tile
    ctx.strokeStyle = COLOR_WALL_MORTAR
    ctx.lineWidth = 1
    const brickH = TILE / 2
    const brickW = TILE
    for (let row = 0; row < height * 2; row++) {
      const y = row * brickH
      // Horizontal mortar line
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width * TILE, y); ctx.stroke()
      // Vertical breaks, offset every other row to create staggered brick
      const offset = (row % 2) * (TILE / 2)
      for (let x = offset; x <= width * TILE; x += brickW) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + brickH); ctx.stroke()
      }
    }

    // Floor tiles — covers brick texture in room areas
    ctx.fillStyle = COLOR_FLOOR
    for (const room of this.map.rooms) {
      ctx.fillRect(room.x * TILE, room.y * TILE, room.width * TILE, room.height * TILE)
    }

    // Grid overlay (on floors only, but drawing everywhere — walls already have brick grid)
    ctx.strokeStyle = COLOR_GRID
    ctx.lineWidth = 0.5
    for (let col = 0; col <= width; col++) {
      ctx.beginPath(); ctx.moveTo(col * TILE, 0); ctx.lineTo(col * TILE, height * TILE); ctx.stroke()
    }
    for (let row = 0; row <= height; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * TILE); ctx.lineTo(width * TILE, row * TILE); ctx.stroke()
    }

    // Room borders — bright edge showing wall-floor boundary (2px outside + subtle glow)
    ctx.shadowColor = COLOR_WALL_EDGE
    ctx.shadowBlur = 4
    ctx.strokeStyle = COLOR_ROOM_BORDER
    ctx.lineWidth = 2
    for (const room of this.map.rooms) {
      ctx.strokeRect(room.x * TILE, room.y * TILE, room.width * TILE, room.height * TILE)
    }
    ctx.shadowBlur = 0

    // Doors
    for (const door of doors) {
      this.drawDoor(ctx, door)
    }
  }

  private drawDoor(ctx: CanvasRenderingContext2D, door: Door): void {
    const x  = door.x * TILE
    const y  = door.y * TILE
    const cx = x + TILE / 2
    const cy = y + TILE / 2

    // Detect passage direction:
    // If rooms are to the left/right, the door is in a vertical wall → tall narrow opening.
    // If rooms are above/below, the door is in a horizontal wall → wide short opening.
    const connectsH = this.isFloor(door.x - 1, door.y) || this.isFloor(door.x + 1, door.y)

    ctx.save()

    if (connectsH) {
      // Vertical door in a vertical wall (player moves left/right through it)
      const dw = Math.round(TILE * 0.35)
      const dh = TILE - 4
      const dx = cx - dw / 2
      const dy = y + 2

      ctx.fillStyle = door.locked ? DOOR_LOCKED_FILL : DOOR_OPEN_FILL
      ctx.fillRect(dx, dy, dw, dh)

      ctx.strokeStyle = DOOR_FRAME
      ctx.lineWidth = 2
      ctx.strokeRect(dx, dy, dw, dh)

      if (door.locked) {
        ctx.strokeStyle = DOOR_LOCKED_GLOW
        ctx.lineWidth = 1.5
        ctx.shadowColor = DOOR_LOCKED_GLOW
        ctx.shadowBlur = 8
        ctx.strokeRect(dx, dy, dw, dh)
        ctx.shadowBlur = 0
        // Lock symbol
        ctx.fillStyle = DOOR_LOCKED_GLOW
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('L', cx, cy)
      } else {
        ctx.fillStyle = DOOR_OPEN_STROKE
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('▸', cx, cy)
      }
    } else {
      // Horizontal door in a horizontal wall (player moves up/down through it)
      const dw = TILE - 4
      const dh = Math.round(TILE * 0.35)
      const dx = x + 2
      const dy = cy - dh / 2

      ctx.fillStyle = door.locked ? DOOR_LOCKED_FILL : DOOR_OPEN_FILL
      ctx.fillRect(dx, dy, dw, dh)

      ctx.strokeStyle = DOOR_FRAME
      ctx.lineWidth = 2
      ctx.strokeRect(dx, dy, dw, dh)

      if (door.locked) {
        ctx.strokeStyle = DOOR_LOCKED_GLOW
        ctx.lineWidth = 1.5
        ctx.shadowColor = DOOR_LOCKED_GLOW
        ctx.shadowBlur = 8
        ctx.strokeRect(dx, dy, dw, dh)
        ctx.shadowBlur = 0
        ctx.fillStyle = DOOR_LOCKED_GLOW
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('L', cx, cy)
      } else {
        ctx.fillStyle = DOOR_OPEN_STROKE
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('▾', cx, cy)
      }
    }

    ctx.restore()
  }
}
