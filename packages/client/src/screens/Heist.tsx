/**
 * Heist.tsx — Live heist gameplay screen.
 *
 * Rendered when gamePhase === 'heist'.
 *
 * Responsibilities:
 *  - Canvas rendering: tiles, players, loot, cameras, guards
 *  - WASD / arrow-key movement → player_move messages
 *  - HUD: role label, loot count, lockdown banner + timer
 *  - Security toolbar (only shown to Security player)
 */
import { useEffect, useRef } from 'preact/hooks'
import type { GameState } from '@heist/shared'
import { connection } from '../net/connection'
import {
  currentGameState,
  currentRoom,
  myPlayerId,
  myPlayer,
} from '../state/client-state'
import { BASIC_MAP, TICK_RATE } from '@heist/shared'
import { MapRenderer, TILE } from '../canvas/MapRenderer'
import { EntityLayer } from '../canvas/EntityLayer'

// ─── Design tokens ────────────────────────────────────────────────────────────
const R  = '#ff003c'
const G  = '#00ff88'
const B  = '#00cfff'
const P  = '#bf00ff'
const BG = '#0a0a0f'

// ─── Map renderer singletons (stable across renders) ─────────────────────────
const mapRenderer = new MapRenderer(BASIC_MAP)
const entityLayer = new EntityLayer()

// ─── Key → direction mapping ──────────────────────────────────────────────────
type DirKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'w' | 'a' | 's' | 'd'
const KEY_TO_DELTA: Record<DirKey, { dx: number; dy: number }> = {
  ArrowUp:    { dx: 0, dy: -1 },
  w:          { dx: 0, dy: -1 },
  ArrowDown:  { dx: 0, dy:  1 },
  s:          { dx: 0, dy:  1 },
  ArrowLeft:  { dx: -1, dy: 0 },
  a:          { dx: -1, dy: 0 },
  ArrowRight: { dx:  1, dy: 0 },
  d:          { dx:  1, dy: 0 },
}

// ─── Cooldown state (client-side display only, server is authoritative) ───────
interface CooldownMap {
  lock_door: number
  cut_lights: number
  trigger_alarm: number
  release_guard: number
}

// ─── Security toolbar button ──────────────────────────────────────────────────
function SecurityButton({
  testId,
  label,
  cooldown,
  onClick,
}: {
  testId: string
  label: string
  cooldown: number
  onClick: () => void
}) {
  const disabled = cooldown > 0
  const secs = Math.ceil(cooldown / TICK_RATE)
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 14px',
        background: disabled ? '#0a0a0f' : '#100014',
        color: disabled ? '#333' : P,
        border: `2px solid ${disabled ? '#222' : P}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'VT323', monospace",
        fontSize: '18px',
        letterSpacing: '1px',
        position: 'relative',
        minWidth: '120px',
        transition: 'all .15s',
      }}
    >
      {disabled ? `${label} [${secs}s]` : label}
    </button>
  )
}

// ─── Security Toolbar ─────────────────────────────────────────────────────────
function SecurityToolbar({ cooldowns, setCooldowns }: {
  cooldowns: CooldownMap
  setCooldowns: (c: CooldownMap) => void
}) {
  function sendAction(action: keyof CooldownMap, targetId?: string) {
    connection.send({ type: 'security_action', action, targetId })
    // Optimistic local cooldown display
    const CD: Record<string, number> = {
      lock_door: 60,
      cut_lights: 600,
      trigger_alarm: 0,
      release_guard: 0,
    }
    const newCd = { ...cooldowns, [action]: CD[action] ?? 0 }
    setCooldowns(newCd)
  }

  return (
    <div
      data-testid="security-toolbar"
      style={{
        display: 'flex',
        gap: '10px',
        padding: '12px 20px',
        background: '#0c0010',
        borderTop: `2px solid #1a001a`,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <span style={{ color: B, fontFamily: "'VT323', monospace", fontSize: '18px', letterSpacing: '2px', marginRight: '6px' }}>
        ▶ SEC TOOLKIT:
      </span>
      <SecurityButton
        testId="btn-lock-door"
        label="LOCK DOOR"
        cooldown={cooldowns.lock_door}
        onClick={() => sendAction('lock_door')}
      />
      <SecurityButton
        testId="btn-trigger-alarm"
        label="TRIGGER ALARM"
        cooldown={cooldowns.trigger_alarm}
        onClick={() => sendAction('trigger_alarm')}
      />
      <SecurityButton
        testId="btn-cut-lights"
        label="CUT LIGHTS"
        cooldown={cooldowns.cut_lights}
        onClick={() => sendAction('cut_lights')}
      />
      <SecurityButton
        testId="btn-release-guard"
        label="RELEASE GUARD"
        cooldown={cooldowns.release_guard}
        onClick={() => sendAction('release_guard')}
      />
    </div>
  )
}

// ─── HUD overlay ──────────────────────────────────────────────────────────────
// Props driven: parent (Heist) reads signals and passes data down so that
// Heist itself is subscribed to gameState changes and re-renders on every tick.
function Hud({ gs, role, myId }: {
  gs: GameState | null
  role: string
  myId: string | null
}) {
  const roleLabel = role === 'security' ? 'SECURITY' : 'THIEF'
  const roleColor = role === 'security' ? B : P

  const myPos     = gs?.playerPositions.find(p => p.playerId === myId)
  const lootCount = myPos?.lootCarried.length ?? 0

  const lockdown  = gs?.alarmTriggered ?? false
  const lockSecs  = gs ? Math.ceil(gs.lockdownTicksRemaining / TICK_RATE) : 0

  return (
    <>
      {/* Role + loot row */}
      <div style={{
        position: 'absolute', top: 12, left: 16,
        display: 'flex', gap: '16px', alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 10,
      }}>
        <span
          data-testid="hud-role"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '13px', color: roleColor,
            textShadow: `0 0 12px ${roleColor}`,
            letterSpacing: '2px',
          }}
        >
          {roleLabel}
        </span>
        {role === 'thief' && (
          <span
            data-testid="hud-loot"
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: '20px', color: '#ffd700',
              letterSpacing: '1px',
            }}
          >
            ◈ LOOT: {lootCount}
          </span>
        )}
      </div>

      {/* Lockdown banner */}
      {lockdown && (
        <div
          data-testid="lockdown-banner"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: 'rgba(139,0,0,0.85)',
            borderBottom: `2px solid ${R}`,
            padding: '8px', textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '13px', color: R,
            textShadow: `0 0 16px ${R}`,
            letterSpacing: '3px',
          }}>
            ⚠ LOCKDOWN — AUTHORITIES IN{' '}
          </span>
          <span
            data-testid="lockdown-timer"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '13px', color: '#ffcc00',
              textShadow: '0 0 12px #ffcc00',
              letterSpacing: '2px',
            }}
          >
            {lockSecs}s
          </span>
        </div>
      )}
    </>
  )
}

// ─── Heist screen ─────────────────────────────────────────────────────────────
export function Heist() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Read all signals in Heist's body so Heist subscribes to them.
  // This guarantees re-renders when the game state changes.
  const me          = myPlayer.value
  const gs          = currentGameState.value
  const myId        = myPlayerId.value
  const room        = currentRoom.value

  const role        = me?.role ?? 'thief'
  const isSecurity  = role === 'security'

  // Cooldown state for toolbar display (ref to avoid signal re-renders for cooldowns)
  const cooldownsRef = useRef<CooldownMap>({
    lock_door: 0,
    cut_lights: 0,
    trigger_alarm: 0,
    release_guard: 0,
  })

  // Build playerRoleMap from room players
  const playerRoleMap: Record<string, string> = {}
  if (room) {
    for (const p of room.players) {
      playerRoleMap[p.id] = p.role
    }
  }

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Size the canvas to fit the map
    canvas.width  = mapRenderer.pixelWidth
    canvas.height = mapRenderer.pixelHeight

    let frameId: number

    function renderFrame() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return

      const state = currentGameState.value
      if (!state) {
        ctx.fillStyle = BG
        ctx.fillRect(0, 0, canvas!.width, canvas!.height)
        frameId = requestAnimationFrame(renderFrame)
        return
      }

      mapRenderer.draw(ctx, state.doors)
      entityLayer.draw(ctx, state, myPlayerId.value, playerRoleMap)

      frameId = requestAnimationFrame(renderFrame)
    }

    frameId = requestAnimationFrame(renderFrame)
    return () => cancelAnimationFrame(frameId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── WASD / Arrow key movement ─────────────────────────────────────────────
  useEffect(() => {
    const pressed = new Set<string>()

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key as DirKey
      if (!(key in KEY_TO_DELTA)) return
      if (pressed.has(key)) return   // avoid repeat bursts
      e.preventDefault()
      pressed.add(key)

      const delta = KEY_TO_DELTA[key]
      connection.send({ type: 'player_move', dx: delta.dx, dy: delta.dy })
    }

    function onKeyUp(e: KeyboardEvent) {
      pressed.delete(e.key)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Cooldown tick-down ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const cd = cooldownsRef.current
      let changed = false
      const next: CooldownMap = { ...cd }
      for (const k of Object.keys(next) as (keyof CooldownMap)[]) {
        if (next[k] > 0) {
          next[k] = Math.max(0, next[k] - 1)
          changed = true
        }
      }
      if (changed) cooldownsRef.current = next
    }, 50) // ~50ms matches TICK_MS
    return () => clearInterval(id)
  }, [])

  const wrapStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: BG,
    overflow: 'hidden',
    fontFamily: "'VT323', monospace",
  }

  return (
    <div style={wrapStyle}>
      {/* Canvas area with HUD overlay */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          data-testid="heist-canvas"
          ref={canvasRef}
          style={{
            display: 'block',
            imageRendering: 'pixelated' as const,
            cursor: 'crosshair',
          }}
          tabIndex={0}
        />
        <Hud gs={gs} role={role} myId={myId} />
      </div>

      {/* Security toolbar — only for Security player */}
      {isSecurity && (
        <SecurityToolbar
          cooldowns={cooldownsRef.current}
          setCooldowns={(c) => { cooldownsRef.current = c }}
        />
      )}
    </div>
  )
}
