/**
 * EntityLayer.ts — Draws players, loot, cameras, guards and the exit
 * onto the canvas.
 *
 * Coordinates are in pixels (x, y).  The TILE constant is used to convert
 * tile-based entity positions (loot, cameras, guards, exit) to pixel centres.
 */
import type { GameState, PlayerPosition } from '@heist/shared'
import { TILE } from './MapRenderer'

// Player role colours — must stay in sync with design tokens
const PLAYER_COLORS: Record<string, string> = {
  security: '#00cfff',
  thief:    '#bf00ff',
}
const PLAYER_FROZEN_COLOR = '#4444ff'
const LOOT_COLOR    = '#ffd700'
const CAMERA_COLOR  = '#00ff88'
const CAMERA_DESTROYED_COLOR = '#333'
const GUARD_COLOR   = '#ff4444'
const EXIT_COLOR    = '#00ff88'

const PLAYER_RADIUS = 10
const GUARD_RADIUS  = 9
const LOOT_HALF    = 6  // half-side of loot square

export class EntityLayer {
  /**
   * Draw all entities from `gameState` onto `ctx`.
   *
   * @param myPlayerId  The local player's id — used to highlight.
   * @param myRole      'security' | 'thief' | 'unassigned'
   */
  draw(
    ctx: CanvasRenderingContext2D,
    gameState: GameState,
    myPlayerId: string | null,
    playerRoleMap: Record<string, string>,
  ): void {
    this.drawExit(ctx, gameState)
    this.drawLoot(ctx, gameState)
    this.drawCameras(ctx, gameState)
    this.drawGuards(ctx, gameState)
    this.drawPlayers(ctx, gameState, myPlayerId, playerRoleMap)
  }

  private drawExit(ctx: CanvasRenderingContext2D, gs: GameState): void {
    const cx = gs.exit.x * TILE + TILE / 2
    const cy = gs.exit.y * TILE + TILE / 2
    ctx.save()
    ctx.strokeStyle = EXIT_COLOR
    ctx.lineWidth = 2
    ctx.strokeRect(cx - TILE / 2 + 4, cy - TILE / 2 + 4, TILE - 8, TILE - 8)
    ctx.fillStyle = 'rgba(0,255,136,0.12)'
    ctx.fillRect(cx - TILE / 2 + 4, cy - TILE / 2 + 4, TILE - 8, TILE - 8)
    // "EXIT" label
    ctx.fillStyle = EXIT_COLOR
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('EXIT', cx, cy)
    ctx.restore()
  }

  private drawLoot(ctx: CanvasRenderingContext2D, gs: GameState): void {
    for (const loot of gs.loot) {
      if (loot.carried) continue // carried loot drawn on player
      const cx = loot.x * TILE + TILE / 2
      const cy = loot.y * TILE + TILE / 2
      ctx.save()
      ctx.fillStyle = LOOT_COLOR
      ctx.fillRect(cx - LOOT_HALF, cy - LOOT_HALF, LOOT_HALF * 2, LOOT_HALF * 2)
      ctx.strokeStyle = '#b8860b'
      ctx.lineWidth = 1
      ctx.strokeRect(cx - LOOT_HALF, cy - LOOT_HALF, LOOT_HALF * 2, LOOT_HALF * 2)
      ctx.restore()
    }
  }

  private drawCameras(ctx: CanvasRenderingContext2D, gs: GameState): void {
    for (const cam of gs.cameras) {
      const cx = cam.x * TILE + TILE / 2
      const cy = cam.y * TILE + TILE / 2
      ctx.save()
      ctx.fillStyle = cam.destroyed ? CAMERA_DESTROYED_COLOR : CAMERA_COLOR
      ctx.beginPath()
      // Small diamond shape
      ctx.moveTo(cx, cy - 7)
      ctx.lineTo(cx + 7, cy)
      ctx.lineTo(cx, cy + 7)
      ctx.lineTo(cx - 7, cy)
      ctx.closePath()
      ctx.fill()
      if (!cam.destroyed) {
        ctx.strokeStyle = '#006644'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawGuards(ctx: CanvasRenderingContext2D, gs: GameState): void {
    for (const guard of gs.guards) {
      const cx = guard.x * TILE + TILE / 2
      const cy = guard.y * TILE + TILE / 2
      ctx.save()
      ctx.fillStyle = guard.alerted ? '#ff8800' : GUARD_COLOR
      ctx.beginPath()
      ctx.arc(cx, cy, GUARD_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = guard.alerted ? '#ffcc00' : '#8b0000'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Guard label
      ctx.fillStyle = '#fff'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('G', cx, cy)
      ctx.restore()
    }
  }

  private drawPlayers(
    ctx: CanvasRenderingContext2D,
    gs: GameState,
    myPlayerId: string | null,
    playerRoleMap: Record<string, string>,
  ): void {
    for (const pos of gs.playerPositions) {
      const role  = playerRoleMap[pos.playerId] ?? 'thief'
      const color = pos.frozen ? PLAYER_FROZEN_COLOR : (PLAYER_COLORS[role] ?? PLAYER_COLORS.thief)
      const isMe  = pos.playerId === myPlayerId

      ctx.save()

      // Glow for local player
      if (isMe) {
        ctx.shadowColor = color
        ctx.shadowBlur  = 18
      }

      // Circle body
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2)
      ctx.fill()

      // Border
      ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.4)'
      ctx.lineWidth = isMe ? 2 : 1
      ctx.stroke()

      // Loot indicator dots
      if (pos.lootCarried.length > 0) {
        ctx.fillStyle = LOOT_COLOR
        for (let i = 0; i < pos.lootCarried.length; i++) {
          ctx.beginPath()
          ctx.arc(pos.x - 6 + i * 6, pos.y - PLAYER_RADIUS - 5, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.restore()
    }
  }
}
