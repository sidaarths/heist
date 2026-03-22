/**
 * EntityLayer.ts — Draws players, loot, cameras, alarm panels, guards and
 * the exit onto the canvas.
 *
 * Security players are NEVER rendered on the map — they are omniscient
 * overseers who watch via the side panel, not physical entities.
 */
import type { GameState } from '@heist/shared'
import { TILE } from './MapRenderer'

export interface InteractionProgress {
  playerId: string
  action: 'pick_lock' | 'destroy_camera' | 'disable_alarm'
  /** 0..1 */
  progress: number
}

const PLAYER_COLORS: Record<string, string> = {
  thief: '#bf00ff',
}
const PLAYER_FROZEN_COLOR = '#4444ff'
const LOOT_COLOR    = '#ffd700'
const CAMERA_COLOR  = '#00ff88'
const CAMERA_DESTROYED_COLOR = '#444'
const GUARD_COLOR   = '#ff4444'
const EXIT_COLOR    = '#00ff88'
const ALARM_COLOR   = '#ffaa00'
const ALARM_DISABLED_COLOR = '#333'

const PLAYER_RADIUS = 10
const GUARD_RADIUS  = 9
const LOOT_HALF    = 6

export class EntityLayer {
  /**
   * Draw all entities.
   *
   * @param myPlayerId  Local player id — used for glow highlight
   * @param playerRoleMap  playerId → role
   * @param waypoints  Guard patrol waypoints being placed (security targeting mode)
   */
  draw(
    ctx: CanvasRenderingContext2D,
    gameState: GameState,
    myPlayerId: string | null,
    playerRoleMap: Record<string, string>,
    waypoints?: Array<{ x: number; y: number }>,
    interaction?: InteractionProgress | null,
  ): void {
    this.drawExit(ctx, gameState)
    this.drawAlarmPanels(ctx, gameState)
    this.drawLoot(ctx, gameState)
    this.drawCameras(ctx, gameState)
    this.drawGuards(ctx, gameState)
    this.drawInteractableHighlights(ctx, gameState, myPlayerId, playerRoleMap)
    this.drawPlayers(ctx, gameState, myPlayerId, playerRoleMap, interaction)
    if (waypoints && waypoints.length > 0) {
      this.drawWaypoints(ctx, waypoints)
    }
  }

  private drawExit(ctx: CanvasRenderingContext2D, gs: GameState): void {
    const cx = gs.exit.x * TILE + TILE / 2
    const cy = gs.exit.y * TILE + TILE / 2
    ctx.save()
    ctx.strokeStyle = EXIT_COLOR
    ctx.lineWidth = 2
    ctx.shadowColor = EXIT_COLOR
    ctx.shadowBlur = 8
    ctx.strokeRect(cx - TILE / 2 + 4, cy - TILE / 2 + 4, TILE - 8, TILE - 8)
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(0,255,136,0.12)'
    ctx.fillRect(cx - TILE / 2 + 4, cy - TILE / 2 + 4, TILE - 8, TILE - 8)
    ctx.fillStyle = EXIT_COLOR
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('EXIT', cx, cy)
    ctx.restore()
  }

  private drawAlarmPanels(ctx: CanvasRenderingContext2D, gs: GameState): void {
    for (const panel of gs.alarmPanels) {
      const cx = panel.x * TILE + TILE / 2
      const cy = panel.y * TILE + TILE / 2
      const color = panel.disabled ? ALARM_DISABLED_COLOR
                  : panel.triggered ? '#ff2200'
                  : ALARM_COLOR
      ctx.save()

      // Warning triangle
      ctx.beginPath()
      ctx.moveTo(cx, cy - 9)
      ctx.lineTo(cx + 9, cy + 6)
      ctx.lineTo(cx - 9, cy + 6)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      if (!panel.disabled) {
        ctx.strokeStyle = panel.triggered ? '#ff6666' : '#cc8800'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Exclamation inside
      ctx.fillStyle = panel.disabled ? '#222' : '#000'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('!', cx, cy + 1)

      ctx.restore()
    }
  }

  private drawLoot(ctx: CanvasRenderingContext2D, gs: GameState): void {
    for (const loot of gs.loot) {
      if (loot.carried) continue
      const cx = loot.x * TILE + TILE / 2
      const cy = loot.y * TILE + TILE / 2
      ctx.save()
      // Gold bag shape: circle with $ symbol
      ctx.beginPath()
      ctx.arc(cx, cy, LOOT_HALF + 1, 0, Math.PI * 2)
      ctx.fillStyle = LOOT_COLOR
      ctx.fill()
      ctx.strokeStyle = '#b8860b'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#4a3000'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', cx, cy)
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
        ctx.arc(cx, cy, TILE * 2.5, cam.angle - cam.fov / 2, cam.angle + cam.fov / 2)
        ctx.closePath()
        ctx.fillStyle = 'rgba(0,255,136,0.07)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,255,136,0.2)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Camera housing
      const hw = 7, hh = 5
      ctx.fillStyle = cam.destroyed ? '#1a1a1a' : '#0a2010'
      ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2)

      // Lens
      if (!cam.destroyed) {
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#001a0d'
        ctx.fill()
        ctx.strokeStyle = CAMERA_COLOR
        ctx.lineWidth = 1
        ctx.stroke()
        // Lens glint
        ctx.beginPath()
        ctx.arc(cx - 1, cy - 1, 1, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fill()
      } else {
        // X mark when destroyed
        ctx.strokeStyle = '#666'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4)
        ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4)
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

      // Shield / pentagon
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

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(guard.alerted ? '!' : 'G', cx, cy)

      ctx.restore()
    }
  }

  private drawInteractableHighlights(
    ctx: CanvasRenderingContext2D,
    gs: GameState,
    myPlayerId: string | null,
    playerRoleMap: Record<string, string>,
  ): void {
    const myPos = gs.playerPositions.find(p => p.playerId === myPlayerId)
    if (!myPos) return
    if ((playerRoleMap[myPlayerId ?? ''] ?? 'thief') !== 'thief') return

    const RANGE = 3
    const nearby = (ox: number, oy: number) =>
      Math.abs(ox - myPos.x) + Math.abs(oy - myPos.y) <= RANGE

    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.5

    for (const door of gs.doors) {
      if (!door.locked || !nearby(door.x, door.y)) continue
      ctx.strokeStyle = 'rgba(255,180,180,0.55)'
      ctx.strokeRect(door.x * TILE + 2, door.y * TILE + 2, TILE - 4, TILE - 4)
    }
    for (const item of gs.loot) {
      if (item.carried || !nearby(item.x, item.y)) continue
      ctx.strokeStyle = 'rgba(255,230,80,0.55)'
      ctx.beginPath()
      ctx.arc(item.x * TILE + TILE / 2, item.y * TILE + TILE / 2, LOOT_HALF + 5, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const cam of gs.cameras) {
      if (cam.destroyed || !nearby(cam.x, cam.y)) continue
      ctx.strokeStyle = 'rgba(80,255,160,0.45)'
      ctx.strokeRect(cam.x * TILE + 1, cam.y * TILE + 1, TILE - 2, TILE - 2)
    }
    for (const panel of gs.alarmPanels) {
      if (panel.disabled || !nearby(panel.x, panel.y)) continue
      ctx.strokeStyle = 'rgba(255,180,60,0.55)'
      ctx.strokeRect(panel.x * TILE + 1, panel.y * TILE + 1, TILE - 2, TILE - 2)
    }

    ctx.setLineDash([])
    ctx.restore()
  }

  private drawPlayers(
    ctx: CanvasRenderingContext2D,
    gs: GameState,
    myPlayerId: string | null,
    playerRoleMap: Record<string, string>,
    interaction?: InteractionProgress | null,
  ): void {
    for (const pos of gs.playerPositions) {
      const role = playerRoleMap[pos.playerId] ?? 'thief'

      // Security is an overseer — never has a physical map presence
      if (role === 'security') continue

      const color = pos.frozen ? PLAYER_FROZEN_COLOR : (PLAYER_COLORS[role] ?? PLAYER_COLORS.thief)
      const isMe  = pos.playerId === myPlayerId

      const cx = pos.x * TILE + TILE / 2
      const cy = pos.y * TILE + TILE / 2

      ctx.save()

      if (isMe) {
        ctx.shadowColor = color
        ctx.shadowBlur  = 20
      }

      // Thief: hooded figure — circle head + triangle cloak
      const headR = 6
      const cloakBase = cy + PLAYER_RADIUS

      // Cloak (triangle body)
      ctx.beginPath()
      ctx.moveTo(cx, cloakBase)
      ctx.lineTo(cx - 9, cy + 2)
      ctx.lineTo(cx + 9, cy + 2)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.35)'
      ctx.lineWidth = isMe ? 2 : 1
      ctx.stroke()

      // Head
      ctx.beginPath()
      ctx.arc(cx, cy - 3, headR, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.35)'
      ctx.stroke()

      // Eyes
      ctx.fillStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.arc(cx - 2, cy - 3, 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx + 2, cy - 3, 1.2, 0, Math.PI * 2)
      ctx.fill()

      // Loot indicator dots
      if (pos.lootCarried.length > 0) {
        ctx.shadowBlur = 0
        ctx.fillStyle = LOOT_COLOR
        for (let i = 0; i < pos.lootCarried.length; i++) {
          ctx.beginPath()
          ctx.arc(cx - 6 + i * 6, cy - PLAYER_RADIUS - 9, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Interaction progress ring
      if (interaction && interaction.playerId === pos.playerId && interaction.progress > 0) {
        const ringR = PLAYER_RADIUS + 8
        const sweepAngle = 2 * Math.PI * interaction.progress
        const ringColors: Record<string, string> = {
          pick_lock:      '#bf00ff',
          destroy_camera: '#ff4444',
          disable_alarm:  '#ffaa00',
        }
        const ringColor = ringColors[interaction.action] ?? '#ffffff'

        ctx.shadowBlur = 0
        // Track ring
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 3
        ctx.stroke()
        // Progress arc
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + sweepAngle)
        ctx.strokeStyle = ringColor
        ctx.lineWidth = 3
        ctx.shadowColor = ringColor
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      ctx.restore()
    }
  }

  private drawWaypoints(
    ctx: CanvasRenderingContext2D,
    waypoints: Array<{ x: number; y: number }>,
  ): void {
    ctx.save()
    ctx.strokeStyle = '#ffcc00'
    ctx.fillStyle = 'rgba(255,204,0,0.15)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])

    // Connect waypoints with dashed line
    if (waypoints.length > 1) {
      ctx.beginPath()
      for (let i = 0; i < waypoints.length; i++) {
        const px = waypoints[i].x * TILE + TILE / 2
        const py = waypoints[i].y * TILE + TILE / 2
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    ctx.setLineDash([])

    // Draw each waypoint marker
    for (let i = 0; i < waypoints.length; i++) {
      const px = waypoints[i].x * TILE + TILE / 2
      const py = waypoints[i].y * TILE + TILE / 2
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,204,0,0.3)'
      ctx.fill()
      ctx.strokeStyle = '#ffcc00'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Waypoint number
      ctx.fillStyle = '#ffcc00'
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), px, py)
    }

    ctx.restore()
  }
}
