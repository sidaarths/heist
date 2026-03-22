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
      const color = cam.destroyed ? CAMERA_DESTROYED_COLOR : CAMERA_COLOR
      ctx.save()

      if (!cam.destroyed) {
        // FOV wedge
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, TILE * 2, cam.angle - cam.fov / 2, cam.angle + cam.fov / 2)
        ctx.closePath()
        ctx.fillStyle = 'rgba(0,255,136,0.08)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,255,136,0.25)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Camera housing — small rectangle
      const hw = 7, hh = 5
      ctx.fillStyle = color
      ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2)
      ctx.strokeStyle = cam.destroyed ? '#555' : '#006644'
      ctx.lineWidth = 1
      ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2)

      // Lens circle
      if (!cam.destroyed) {
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#001a0d'
        ctx.fill()
        ctx.strokeStyle = CAMERA_COLOR
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
      const color = guard.alerted ? '#ff8800' : GUARD_COLOR
      ctx.save()

      // Shield / pentagon shape
      ctx.beginPath()
      ctx.moveTo(cx, cy - GUARD_RADIUS)
      ctx.lineTo(cx + GUARD_RADIUS, cy - GUARD_RADIUS * 0.4)
      ctx.lineTo(cx + GUARD_RADIUS * 0.7, cy + GUARD_RADIUS * 0.8)
      ctx.lineTo(cx - GUARD_RADIUS * 0.7, cy + GUARD_RADIUS * 0.8)
      ctx.lineTo(cx - GUARD_RADIUS, cy - GUARD_RADIUS * 0.4)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = guard.alerted ? '#ffcc00' : '#8b0000'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Exclamation when alerted
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(guard.alerted ? '!' : 'G', cx, cy)

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

      // Convert tile coordinates → pixel centre
      const cx = pos.x * TILE + TILE / 2
      const cy = pos.y * TILE + TILE / 2

      ctx.save()

      // Glow for local player
      if (isMe) {
        ctx.shadowColor = color
        ctx.shadowBlur  = 18
      }

      if (role === 'security') {
        // Monitor / eye icon
        const mw = 12, mh = 9
        ctx.fillStyle = color
        ctx.fillRect(cx - mw, cy - mh, mw * 2, mh * 2)
        ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.5)'
        ctx.lineWidth = isMe ? 2 : 1
        ctx.strokeRect(cx - mw, cy - mh, mw * 2, mh * 2)
        // Eye pupil
        ctx.beginPath()
        ctx.ellipse(cx, cy, 5, 4, 0, 0, Math.PI * 2)
        ctx.fillStyle = '#001a26'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, 2, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      } else {
        // Thief: hooded figure — circle head + triangle body
        // Body triangle
        ctx.beginPath()
        ctx.moveTo(cx, cy + PLAYER_RADIUS)
        ctx.lineTo(cx - 8, cy + 2)
        ctx.lineTo(cx + 8, cy + 2)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.4)'
        ctx.lineWidth = isMe ? 2 : 1
        ctx.stroke()

        // Head circle
        ctx.beginPath()
        ctx.arc(cx, cy - 4, 6, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.4)'
        ctx.stroke()
      }

      // Loot indicator dots above sprite
      if (pos.lootCarried.length > 0) {
        ctx.shadowBlur = 0
        ctx.fillStyle = LOOT_COLOR
        for (let i = 0; i < pos.lootCarried.length; i++) {
          ctx.beginPath()
          ctx.arc(cx - 6 + i * 6, cy - PLAYER_RADIUS - 8, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.restore()
    }
  }
}
