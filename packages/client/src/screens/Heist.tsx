/**
 * Heist.tsx — Live heist gameplay screen.
 *
 * Two distinct experiences:
 *
 * THIEF VIEW — WASD movement (held-key continuous), click canvas to interact
 *   with nearby objects (pick locks, disable alarms, destroy cameras, take loot).
 *
 * SECURITY VIEW — Omniscient overseer. No physical position on the map.
 *   Full map view showing all thieves, cameras, guards.
 *   Side panel with player tracker + ability toolkit.
 *   Click map to target lock_door or lay guard patrol waypoints.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { GameState } from '@heist/shared'
import { connection } from '../net/connection'
import {
  currentGameState,
  currentRoom,
  myPlayerId,
  myPlayer,
} from '../state/client-state'
import { BASIC_MAP, TICK_MS, TICK_RATE } from '@heist/shared'
import { MapRenderer, TILE } from '../canvas/MapRenderer'
import { EntityLayer } from '../canvas/EntityLayer'

// ─── Design tokens ────────────────────────────────────────────────────────────
const R   = '#ff003c'
const G   = '#00ff88'
const B   = '#00cfff'
const P   = '#bf00ff'
const Y   = '#ffcc00'
const BG  = '#0a0a0f'
const PANEL_BG = '#06060e'

// ─── Map renderer singletons ──────────────────────────────────────────────────
const mapRenderer = new MapRenderer(BASIC_MAP)
const entityLayer = new EntityLayer()

// ─── Key → direction mapping ──────────────────────────────────────────────────
type DirKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'w' | 'a' | 's' | 'd'
const DIR_KEYS = new Set<string>(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'])
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

// ─── Cooldown state ───────────────────────────────────────────────────────────
interface CooldownMap {
  lock_door: number
  cut_lights: number
  trigger_alarm: number
  release_guard: number
}
const COOLDOWN_TICKS: Record<string, number> = {
  lock_door: 60,
  cut_lights: 600,
  trigger_alarm: 0,
  release_guard: 0,
}

type TargetingAction = 'lock_door' | 'release_guard' | null

// ─── Ability button ───────────────────────────────────────────────────────────
function AbilityBtn({
  testId, label, icon, cooldown, active, onClick,
}: {
  testId: string; label: string; icon: string
  cooldown: number; active?: boolean; onClick: () => void
}) {
  const disabled = cooldown > 0
  const secs = Math.ceil(cooldown / TICK_RATE)
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 8px',
        background: active ? '#1a1200' : (disabled ? '#080810' : '#0e0018'),
        color: active ? Y : (disabled ? '#333' : P),
        border: `2px solid ${active ? Y : (disabled ? '#1a1a2e' : '#3a0060')}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'VT323', monospace",
        fontSize: '15px',
        letterSpacing: '1px',
        flex: 1,
        minWidth: '100px',
        transition: 'all .12s',
        boxShadow: active ? `0 0 12px ${Y}44` : 'none',
      }}
    >
      <span style={{ fontSize: '20px', marginBottom: '2px' }}>{icon}</span>
      <span>{active ? `${label}` : (disabled ? `${secs}s` : label)}</span>
      {active && <span style={{ fontSize: '11px', color: Y, marginTop: '2px' }}>▼ CLICK MAP</span>}
    </button>
  )
}

// ─── Security side panel ──────────────────────────────────────────────────────
function SecurityPanel({
  gs, cooldowns, targeting, setTargeting, waypoints, onSendGuard,
}: {
  gs: GameState | null
  cooldowns: CooldownMap
  targeting: TargetingAction
  setTargeting: (t: TargetingAction) => void
  waypoints: Array<{ x: number; y: number }>
  onSendGuard: () => void
}) {
  const playerRoles = gs?.room.players ?? []
  const thieves = playerRoles.filter(p => p.role === 'thief')

  const camsActive   = gs?.cameras.filter(c => !c.destroyed).length ?? 0
  const camsTotal    = gs?.cameras.length ?? 0
  const alarmsActive = gs?.alarmPanels.filter(a => !a.disabled && !a.triggered).length ?? 0
  const alarmsTotal  = gs?.alarmPanels.length ?? 0

  function sendImmediate(action: keyof CooldownMap) {
    connection.send({ type: 'security_action', action })
  }

  return (
    <div
      data-testid="security-toolbar"
      style={{
        width: '220px',
        minWidth: '220px',
        background: PANEL_BG,
        borderLeft: `2px solid ${B}22`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'VT323', monospace",
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${B}33`,
        background: '#08081a',
      }}>
        <div style={{ color: B, fontSize: '16px', letterSpacing: '3px' }}>◉ OVERSEER</div>
        <div style={{ color: '#336', fontSize: '12px', marginTop: '2px' }}>SECURITY CONTROL</div>
      </div>

      {/* Thief tracker */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid #111` }}>
        <div style={{ color: '#556', fontSize: '13px', letterSpacing: '2px', marginBottom: '6px' }}>
          THIEF TRACKING
        </div>
        {thieves.length === 0 && (
          <div style={{ color: '#333', fontSize: '14px' }}>no thieves</div>
        )}
        {thieves.map(thief => {
          const pos = gs?.playerPositions.find(p => p.playerId === thief.id)
          return (
            <div key={thief.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '4px',
            }}>
              <span style={{ color: P, fontSize: '15px' }}>› {thief.name}</span>
              {pos && (
                <span style={{ color: '#777', fontSize: '13px' }}>
                  [{Math.floor(pos.x)},{Math.floor(pos.y)}]
                </span>
              )}
              {pos?.frozen && <span style={{ color: '#4488ff', fontSize: '11px' }}>❄</span>}
              {pos && pos.lootCarried.length > 0 && (
                <span style={{ color: '#ffd700', fontSize: '12px' }}>
                  ◈{pos.lootCarried.length}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid #111` }}>
        <div style={{ color: '#556', fontSize: '13px', letterSpacing: '2px', marginBottom: '6px' }}>
          ASSETS
        </div>
        <div style={{ color: '#00cc66', fontSize: '14px', marginBottom: '3px' }}>
          📷 CAMS {camsActive}/{camsTotal}
        </div>
        <div style={{ color: '#cc8800', fontSize: '14px', marginBottom: '3px' }}>
          ⚠ ALARMS {alarmsActive}/{alarmsTotal}
        </div>
        <div style={{ color: '#cc4444', fontSize: '14px' }}>
          🛡 GUARDS {gs?.guards.length ?? 0}
        </div>
      </div>

      {/* Abilities */}
      <div style={{ padding: '10px 14px', flex: 1 }}>
        <div style={{ color: '#556', fontSize: '13px', letterSpacing: '2px', marginBottom: '8px' }}>
          ABILITIES
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <AbilityBtn
            testId="btn-lock-door"
            label="LOCK DOOR"
            icon="🔒"
            cooldown={cooldowns.lock_door}
            active={targeting === 'lock_door'}
            onClick={() => setTargeting(targeting === 'lock_door' ? null : 'lock_door')}
          />
          <AbilityBtn
            testId="btn-cut-lights"
            label="CUT LIGHTS"
            icon="💡"
            cooldown={cooldowns.cut_lights}
            onClick={() => sendImmediate('cut_lights')}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <AbilityBtn
            testId="btn-trigger-alarm"
            label="ALARM"
            icon="🚨"
            cooldown={cooldowns.trigger_alarm}
            onClick={() => sendImmediate('trigger_alarm')}
          />
          <AbilityBtn
            testId="btn-release-guard"
            label="SEND GUARD"
            icon="🛡"
            cooldown={cooldowns.release_guard}
            active={targeting === 'release_guard'}
            onClick={() => setTargeting(targeting === 'release_guard' ? null : 'release_guard')}
          />
        </div>

        {targeting === 'release_guard' && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ color: Y, fontSize: '13px', marginBottom: '4px' }}>
              {waypoints.length} waypoints set
            </div>
            {waypoints.length > 0 && (
              <button
                data-testid="btn-send-guard"
                onClick={onSendGuard}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#001a00',
                  color: G,
                  border: `2px solid ${G}`,
                  cursor: 'pointer',
                  fontFamily: "'VT323', monospace",
                  fontSize: '16px',
                }}
              >
                ▶ DEPLOY GUARD
              </button>
            )}
          </div>
        )}
      </div>

      {/* Alarm status banner */}
      {gs?.alarmTriggered && (
        <div style={{
          padding: '8px 14px',
          background: 'rgba(139,0,0,0.8)',
          borderTop: `2px solid ${R}`,
          color: R,
          fontSize: '14px',
          letterSpacing: '2px',
          textAlign: 'center',
        }}>
          ⚠ LOCKDOWN {Math.ceil((gs?.lockdownTicksRemaining ?? 0) / TICK_RATE)}s
        </div>
      )}
    </div>
  )
}

// ─── HUD overlay (thief only) ─────────────────────────────────────────────────
function ThiefHud({ gs, myId, lightsOut }: {
  gs: GameState | null
  myId: string | null
  lightsOut: boolean
}) {
  const myPos     = gs?.playerPositions.find(p => p.playerId === myId)
  const lootCount = myPos?.lootCarried.length ?? 0
  const lockdown  = gs?.alarmTriggered ?? false
  const lockSecs  = gs ? Math.ceil(gs.lockdownTicksRemaining / TICK_RATE) : 0

  return (
    <>
      <div style={{
        position: 'absolute', top: 10, left: 12,
        display: 'flex', gap: '14px', alignItems: 'center',
        pointerEvents: 'none', zIndex: 10,
      }}>
        <span data-testid="hud-role" style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '11px', color: P,
          textShadow: `0 0 12px ${P}`,
          letterSpacing: '2px',
        }}>
          THIEF
        </span>
        <span data-testid="hud-loot" style={{
          fontFamily: "'VT323', monospace",
          fontSize: '20px', color: '#ffd700',
        }}>
          ◈ {lootCount}
        </span>
        {lightsOut && (
          <span style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px', color: '#aaaaff',
            letterSpacing: '1px',
          }}>
            ◉ LIGHTS OUT
          </span>
        )}
        {myPos?.frozen && (
          <span style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px', color: '#4488ff',
          }}>
            ❄ FROZEN
          </span>
        )}
      </div>

      {lockdown && (
        <div data-testid="lockdown-banner" style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'rgba(139,0,0,0.85)',
          borderBottom: `2px solid ${R}`,
          padding: '7px', textAlign: 'center',
          pointerEvents: 'none', zIndex: 20,
        }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px', color: R, letterSpacing: '3px',
          }}>
            ⚠ LOCKDOWN — AUTHORITIES IN{' '}
          </span>
          <span data-testid="lockdown-timer" style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px', color: '#ffcc00',
          }}>
            {lockSecs}s
          </span>
        </div>
      )}

      {/* Interaction hint */}
      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        color: '#334', fontFamily: "'VT323', monospace",
        fontSize: '14px', letterSpacing: '1px',
        pointerEvents: 'none',
      }}>
        WASD/ARROWS: MOVE  ·  CLICK: INTERACT
      </div>
    </>
  )
}

// ─── Security HUD (minimal — panel has the detail) ────────────────────────────
function SecurityHud({ gs }: { gs: GameState | null }) {
  const lockdown = gs?.alarmTriggered ?? false
  const lockSecs = gs ? Math.ceil(gs.lockdownTicksRemaining / TICK_RATE) : 0

  return (
    <>
      <div style={{
        position: 'absolute', top: 10, left: 12,
        pointerEvents: 'none', zIndex: 10,
      }}>
        <span data-testid="hud-role" style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '11px', color: B,
          textShadow: `0 0 12px ${B}`,
          letterSpacing: '2px',
        }}>
          SECURITY
        </span>
      </div>
      {lockdown && (
        <div data-testid="lockdown-banner" style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'rgba(139,0,0,0.85)',
          borderBottom: `2px solid ${R}`,
          padding: '7px', textAlign: 'center',
          pointerEvents: 'none', zIndex: 20,
        }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px', color: R, letterSpacing: '3px',
          }}>
            ⚠ LOCKDOWN{' '}
          </span>
          <span data-testid="lockdown-timer" style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px', color: '#ffcc00',
          }}>
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

  const me         = myPlayer.value
  const gs         = currentGameState.value
  const myId       = myPlayerId.value
  const room       = currentRoom.value
  const role       = me?.role ?? 'thief'
  const isSecurity = role === 'security'

  // Cooldown display ref (no signal — avoid re-renders on every tick)
  const cooldownsRef = useRef<CooldownMap>({ lock_door: 0, cut_lights: 0, trigger_alarm: 0, release_guard: 0 })
  // Force toolbar re-render when cooldowns change
  const [, forceUpdate] = useState(0)

  // Targeting state for security abilities
  const [targeting, setTargeting] = useState<TargetingAction>(null)
  const [waypoints, setWaypoints] = useState<Array<{ x: number; y: number }>>([])

  // Keep playerRoleMap in a ref so the rAF loop always reads current value
  const playerRoleMapRef = useRef<Record<string, string>>({})
  if (room) {
    const m: Record<string, string> = {}
    for (const p of room.players) m[p.id] = p.role
    playerRoleMapRef.current = m
  }

  // Waypoints ref for canvas click handler (avoids stale closure)
  const waypointsRef = useRef(waypoints)
  waypointsRef.current = waypoints
  const targetingRef = useRef(targeting)
  targetingRef.current = targeting

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

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
      entityLayer.draw(ctx, state, myPlayerId.value, playerRoleMapRef.current, waypointsRef.current)

      // Lights-out fog for thieves
      if (state.lightsOut && !isSecurity) {
        ctx.fillStyle = 'rgba(0,0,8,0.82)'
        ctx.fillRect(0, 0, canvas!.width, canvas!.height)
      }

      frameId = requestAnimationFrame(renderFrame)
    }
    frameId = requestAnimationFrame(renderFrame)
    return () => cancelAnimationFrame(frameId)
  }, [isSecurity]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Continuous WASD movement (held keys) ─────────────────────────────────
  useEffect(() => {
    if (isSecurity) return // security has no movement

    const pressed = new Set<string>()

    function onKeyDown(e: KeyboardEvent) {
      if (DIR_KEYS.has(e.key)) {
        e.preventDefault()
        pressed.add(e.key)
      }
    }
    function onKeyUp(e: KeyboardEvent) { pressed.delete(e.key) }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Tick loop: send accumulated direction every TICK_MS
    const interval = setInterval(() => {
      if (pressed.size === 0) return
      let dx = 0, dy = 0
      for (const key of pressed) {
        const d = KEY_TO_DELTA[key as DirKey]
        if (d) { dx += d.dx; dy += d.dy }
      }
      // Clamp diagonal to unit
      if (dx !== 0) dx = Math.sign(dx)
      if (dy !== 0) dy = Math.sign(dy)
      connection.send({ type: 'player_move', dx, dy })
    }, TICK_MS)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      clearInterval(interval)
    }
  }, [isSecurity])

  // ── Canvas click ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const tx = Math.floor((e.clientX - rect.left) / TILE)
      const ty = Math.floor((e.clientY - rect.top) / TILE)
      const state = currentGameState.value
      if (!state) return

      if (isSecurity) {
        const t = targetingRef.current
        if (t === 'lock_door') {
          // Find nearest unlocked door within 3 tiles
          let best = state.doors[0], bestD = Infinity
          for (const door of state.doors) {
            const d = Math.abs(door.x - tx) + Math.abs(door.y - ty)
            if (d < bestD) { bestD = d; best = door }
          }
          if (best && bestD <= 3) {
            connection.send({ type: 'security_action', action: 'lock_door', targetId: best.id })
            cooldownsRef.current = { ...cooldownsRef.current, lock_door: COOLDOWN_TICKS.lock_door }
            setTargeting(null)
          }
        } else if (t === 'release_guard') {
          setWaypoints(prev => [...prev, { x: tx, y: ty }])
        }
      } else {
        // Thief: interact with nearest object
        const RANGE = 2
        const nearby = (ox: number, oy: number) =>
          Math.abs(ox - tx) <= RANGE && Math.abs(oy - ty) <= RANGE

        // Loot (highest priority)
        for (const item of state.loot) {
          if (!item.carried && nearby(item.x, item.y)) {
            connection.send({ type: 'player_action', action: 'take_loot', targetId: item.id })
            return
          }
        }
        // Locked door → pick lock
        for (const door of state.doors) {
          if (door.locked && nearby(door.x, door.y)) {
            connection.send({ type: 'player_action', action: 'pick_lock', targetId: door.id })
            return
          }
        }
        // Camera → destroy
        for (const cam of state.cameras) {
          if (!cam.destroyed && nearby(cam.x, cam.y)) {
            connection.send({ type: 'player_action', action: 'destroy_camera', targetId: cam.id })
            return
          }
        }
        // Alarm panel → disable
        for (const panel of state.alarmPanels) {
          if (!panel.disabled && nearby(panel.x, panel.y)) {
            connection.send({ type: 'player_action', action: 'disable_alarm', targetId: panel.id })
            return
          }
        }
      }
    }

    canvas.addEventListener('click', onClick)
    return () => canvas.removeEventListener('click', onClick)
  }, [isSecurity]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cooldown tick-down ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const cd = cooldownsRef.current
      let changed = false
      const next: CooldownMap = { ...cd }
      for (const k of Object.keys(next) as (keyof CooldownMap)[]) {
        if (next[k] > 0) { next[k] = Math.max(0, next[k] - 1); changed = true }
      }
      if (changed) { cooldownsRef.current = next; forceUpdate(n => n + 1) }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // When security fires an immediate ability, apply cooldown
  function onSecurityImmediate(action: keyof CooldownMap) {
    connection.send({ type: 'security_action', action })
    cooldownsRef.current = { ...cooldownsRef.current, [action]: COOLDOWN_TICKS[action] ?? 0 }
    forceUpdate(n => n + 1)
  }

  function handleSendGuard() {
    if (waypoints.length === 0) return
    connection.send({ type: 'security_action', action: 'release_guard', patrolPath: waypoints })
    setWaypoints([])
    setTargeting(null)
  }

  const canvasCursor = isSecurity && targeting ? 'cell' : (isSecurity ? 'default' : 'crosshair')

  // ── SECURITY LAYOUT: canvas + side panel ─────────────────────────────────
  if (isSecurity) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: BG, overflow: 'hidden' }}>
        {/* Map canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>
          <canvas
            data-testid="heist-canvas"
            ref={canvasRef}
            style={{
              display: 'block',
              imageRendering: 'pixelated' as const,
              cursor: canvasCursor,
            }}
          />
          <SecurityHud gs={gs} />
        </div>

        {/* Side panel */}
        <SecurityPanel
          gs={gs}
          cooldowns={cooldownsRef.current}
          targeting={targeting}
          setTargeting={(t) => {
            setTargeting(t)
            if (t !== 'release_guard') setWaypoints([])
          }}
          waypoints={waypoints}
          onSendGuard={handleSendGuard}
        />
      </div>
    )
  }

  // ── THIEF LAYOUT: full canvas with HUD overlay ────────────────────────────
  return (
    <div style={{ height: '100vh', background: BG, overflow: 'hidden', position: 'relative' }}>
      <canvas
        data-testid="heist-canvas"
        ref={canvasRef}
        style={{
          display: 'block',
          imageRendering: 'pixelated' as const,
          cursor: canvasCursor,
        }}
        tabIndex={0}
      />
      <ThiefHud gs={gs} myId={myId} lightsOut={gs?.lightsOut ?? false} />
    </div>
  )
}
