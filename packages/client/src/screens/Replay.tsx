/**
 * Replay.tsx — Post-game replay screen.
 *
 * Renders an overhead canvas showing all players progressing through
 * the recorded game buffer. Ghost paths are drawn as translucent lines
 * behind each player as the replay advances.
 *
 * Controls:
 *  - Scrubber bar (data-testid="replay-scrubber") — seek to any tick
 *  - Play/pause (data-testid="replay-play-btn") — toggle playback
 *  - Speed toggle (data-testid="replay-speed-btn") — 1× / 2×
 *  - Back to Results button — sets phase back to 'resolution'
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { GameState } from '@heist/shared'
import { MAPS, TICK_MS, TICK_RATE } from '@heist/shared'
import { replayBuffer, currentRoom } from '../state/client-state'
import { MapRenderer, TILE } from '../canvas/MapRenderer'
import { EntityLayer } from '../canvas/EntityLayer'

// ─── Design tokens ─────────────────────────────────────────────────────────
const BG      = '#0a0a0f'
const B       = '#00cfff'
const G       = '#00ff88'
const D       = '#4a7a4a'
const CARD    = '#0c0c16'

function getMapDef(mapId: string | undefined) {
  return MAPS.find(m => m.id === mapId) ?? MAPS[0]
}

// ─── Ghost path tracker ─────────────────────────────────────────────────────
// Maps playerId → array of {x,y} positions visited up to the current tick
type GhostPaths = Map<string, Array<{ x: number; y: number }>>

function buildGhostPaths(buffer: GameState[], upToTick: number): GhostPaths {
  const paths: GhostPaths = new Map()
  const limit = Math.min(upToTick + 1, buffer.length)
  for (let i = 0; i < limit; i++) {
    const snap = buffer[i]
    for (const pos of snap.playerPositions) {
      if (!paths.has(pos.playerId)) paths.set(pos.playerId, [])
      paths.get(pos.playerId)!.push({ x: pos.x, y: pos.y })
    }
  }
  return paths
}

// Player colour palette — matches EntityLayer colours where possible
const PLAYER_COLORS = ['#bf00ff', '#00cfff', '#ffcc00', '#ff6600', '#00ff88']

function drawGhostPaths(
  ctx: CanvasRenderingContext2D,
  paths: GhostPaths,
  playerIds: string[],
): void {
  playerIds.forEach((pid, idx) => {
    const trail = paths.get(pid)
    if (!trail || trail.length < 2) return
    ctx.save()
    ctx.strokeStyle = PLAYER_COLORS[idx % PLAYER_COLORS.length]
    ctx.globalAlpha = 0.25
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(trail[0].x * TILE + TILE / 2, trail[0].y * TILE + TILE / 2)
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(trail[i].x * TILE + TILE / 2, trail[i].y * TILE + TILE / 2)
    }
    ctx.stroke()
    ctx.restore()
  })
}

// ─── Component ───────────────────────────────────────────────────────────────
export function Replay() {
  const buffer = replayBuffer.value
  const total  = buffer.length
  const room   = currentRoom.value

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRendererRef = useRef<MapRenderer | null>(null)
  const entityLayerRef = useRef(new EntityLayer())
  const ghostPathsRef = useRef<GhostPaths>(new Map())
  const lastBuiltTickRef = useRef<number>(-1)

  const [tick, setTick]       = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed]     = useState<1 | 2>(2)

  // Derive mapDef from first snapshot (or current room state)
  const firstSnap  = buffer[0]
  const mapId      = firstSnap?.mapId ?? (room as { mapId?: string } | null)?.mapId
  const mapDef     = getMapDef(mapId)

  // Build / reuse MapRenderer
  useEffect(() => {
    mapRendererRef.current = new MapRenderer(mapDef)
  }, [mapDef.id])

  // Playback interval
  useEffect(() => {
    if (!playing || total === 0) return
    const intervalMs = TICK_MS / speed
    const id = setInterval(() => {
      setTick(prev => {
        if (prev >= total - 1) {
          setPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, intervalMs)
    return () => clearInterval(id)
  }, [playing, speed, total])

  // Render frame whenever tick changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const snap: GameState | undefined = buffer[tick]
    if (!snap) return

    const mr = mapRendererRef.current
    if (!mr) return

    const W = mapDef.width  * TILE
    const H = mapDef.height * TILE

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W
      canvas.height = H
    }

    // Draw base map
    mr.draw(ctx, snap.doors)

    // Update ghost paths incrementally (extend forward, rebuild on seek-back)
    if (tick > lastBuiltTickRef.current) {
      for (let i = lastBuiltTickRef.current + 1; i <= tick && i < buffer.length; i++) {
        const s = buffer[i]
        for (const pos of s.playerPositions) {
          if (!ghostPathsRef.current.has(pos.playerId)) ghostPathsRef.current.set(pos.playerId, [])
          ghostPathsRef.current.get(pos.playerId)!.push({ x: pos.x, y: pos.y })
        }
      }
      lastBuiltTickRef.current = tick
    } else if (tick < lastBuiltTickRef.current) {
      ghostPathsRef.current = buildGhostPaths(buffer, tick)
      lastBuiltTickRef.current = tick
    }

    // Draw ghost paths
    const playerIds = snap.room.players.map(p => p.id)
    drawGhostPaths(ctx, ghostPathsRef.current, playerIds)

    // Draw entities (players, loot, cameras, etc.) — no local player highlight in replay
    const roleMap: Record<string, string> = {}
    for (const p of snap.room.players) roleMap[p.id] = p.role
    entityLayerRef.current.draw(ctx, snap, null, roleMap)
  }, [tick, buffer, mapDef])

  function handleBack() {
    if (currentRoom.value) {
      currentRoom.value = { ...currentRoom.value, phase: 'resolution' }
    }
  }

  const progressPct = total > 1 ? (tick / (total - 1)) * 100 : 0
  const elapsedSec  = total > 0 ? Math.round(tick / TICK_RATE) : 0

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: "'VT323', monospace",
        padding: '16px',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 'clamp(0.8rem, 2vw, 1.2rem)',
        color: B,
        textShadow: `0 0 20px ${B}`,
        letterSpacing: '4px',
        marginBottom: '4px',
      }}>
        REPLAY
      </div>

      {/* Canvas */}
      <div style={{ border: `1px solid ${B}33`, overflow: 'auto', maxWidth: '100%' }}>
        <canvas
          ref={canvasRef}
          data-testid="replay-canvas"
          style={{ display: 'block' }}
        />
      </div>

      {/* Controls */}
      <div style={{
        background: CARD,
        border: `1px solid ${B}33`,
        borderRadius: '4px',
        padding: '12px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '600px',
      }}>

        {/* Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: B, fontSize: '18px', minWidth: '48px' }}>
            {elapsedSec}s
          </span>
          <input
            type="range"
            aria-label="Replay position"
            data-testid="replay-scrubber"
            min={0}
            max={Math.max(0, total - 1)}
            value={tick}
            onInput={(e) => {
              const val = parseInt((e.target as HTMLInputElement).value, 10)
              setTick(val)
              setPlaying(false)
            }}
            style={{ flex: 1, accentColor: B }}
          />
          <span style={{ color: D, fontSize: '18px', minWidth: '48px', textAlign: 'right' }}>
            {total > 0 ? Math.round((total - 1) / TICK_RATE) : 0}s
          </span>
        </div>

        {/* Playback buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>

          {/* Play / Pause */}
          <button
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            data-testid="replay-play-btn"
            onClick={() => {
              if (tick >= total - 1) {
                setTick(0)
                setPlaying(true)
              } else {
                setPlaying(p => !p)
              }
            }}
            style={{
              padding: '10px 28px',
              background: playing ? '#ff003c' : G,
              color: BG,
              border: 'none',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '11px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            {playing ? '⏸ PAUSE' : '▶ PLAY'}
          </button>

          {/* Speed toggle */}
          <button
            aria-label={`Playback speed: ${speed}×`}
            data-testid="replay-speed-btn"
            onClick={() => setSpeed(s => s === 1 ? 2 : 1)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: B,
              border: `2px solid ${B}`,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '11px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            {speed}×
          </button>

        </div>
      </div>

      {/* Back to Results */}
      <button
        data-testid="back-to-results-btn"
        onClick={handleBack}
        style={{
          padding: '10px 28px',
          background: 'transparent',
          color: D,
          border: `1px solid ${D}`,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '10px',
          letterSpacing: '1px',
          cursor: 'pointer',
          marginTop: '4px',
        }}
      >
        ← BACK TO RESULTS
      </button>
    </div>
  )
}
