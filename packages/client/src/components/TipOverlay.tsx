/**
 * TipOverlay — contextual in-game tips for thieves.
 *
 * Tips fire once per session (tracked by the `shown` Set) based on game
 * state changes: proximity to objects, alarm events, loot count, guards, etc.
 * Each tip auto-dismisses after DISPLAY_MS milliseconds.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { GameState } from '@heist/shared'

interface Tip {
  id: string
  text: string
}

export const TIPS: Record<string, string> = {
  // Controls
  movement_controls:  'WASD or Arrow Keys to move · Click objects nearby to interact',
  // Loot
  first_loot:         'You slow down with each item carried — you only need 3 to escape!',
  carrying_slows:     'Carrying 2+ items slows you significantly — drop one if you need to run',
  loot_full:          'Loot bag full (3/3) — head to the EXIT now',
  // Doors
  near_locked_door:   'Locked door nearby — click it to pick the lock (4 seconds)',
  // Cameras
  near_camera:        'Camera nearby — click it to destroy it (5 seconds) before it spots you',
  // Guards
  guard_spawned:      'A guard is on patrol — get within 1.5 tiles and you\'ll be frozen for 5 seconds',
  guard_nearby:       'Guard nearby! Stay clear or you\'ll be frozen in place',
  // Alarm
  alarm_triggered:    'ALARM triggered! Find an alarm panel (!) and click it to disable the alarm',
}

const DISPLAY_MS = 6000

/** Euclidean distance in tile-space */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

export function TipOverlay({ gs, myId }: { gs: GameState | null; myId: string | null }) {
  const [activeTips, setActiveTips] = useState<Tip[]>([])
  const shown  = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function showTip(id: string) {
    if (shown.current.has(id)) return
    const text = TIPS[id]
    if (!text) return
    shown.current.add(id)

    setActiveTips(prev => [...prev, { id, text }])
    const timer = setTimeout(() => {
      setActiveTips(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, DISPLAY_MS)
    timers.current.set(id, timer)
  }

  // Fire movement tip once on mount (thief just entered the heist)
  useEffect(() => {
    const id = setTimeout(() => showTip('movement_controls'), 800)
    return () => clearTimeout(id)
  }, [])

  // Alarm triggered
  useEffect(() => {
    if (!gs?.alarmTriggered) return
    showTip('alarm_triggered')
  }, [gs?.alarmTriggered])

  // Loot count changes
  const lootCount = gs?.playerPositions.find(p => p.playerId === myId)?.lootCarried.length ?? 0
  useEffect(() => {
    if (!myId) return
    if (lootCount >= 1) showTip('first_loot')
    if (lootCount >= 2) showTip('carrying_slows')
    if (lootCount >= 3) showTip('loot_full')
  }, [lootCount, myId])

  // Guards: spawned + nearby
  const guardCount = gs?.guards.length ?? 0
  useEffect(() => {
    if (guardCount > 0) showTip('guard_spawned')
  }, [guardCount])

  // Proximity-based tips — evaluated whenever gs changes
  const myPos = gs?.playerPositions.find(p => p.playerId === myId)
  useEffect(() => {
    if (!gs || !myPos) return

    // Near a locked door (within 2.5 tiles)
    for (const door of gs.doors) {
      if (door.locked && dist(myPos.x, myPos.y, door.x, door.y) <= 2.5) {
        showTip('near_locked_door')
        break
      }
    }

    // Near an active camera (within 3 tiles)
    for (const cam of gs.cameras) {
      if (!cam.destroyed && dist(myPos.x, myPos.y, cam.x, cam.y) <= 3) {
        showTip('near_camera')
        break
      }
    }

    // Near a guard (within 3 tiles)
    for (const guard of gs.guards) {
      if (dist(myPos.x, myPos.y, guard.x, guard.y) <= 3) {
        showTip('guard_nearby')
        break
      }
    }
  }, [gs?.tick]) // re-evaluate each game tick

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
    }
  }, [])

  if (activeTips.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      bottom: 56,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      alignItems: 'center',
      pointerEvents: 'none',
      zIndex: 25,
      maxWidth: '420px',
      width: '90%',
    }}>
      {activeTips.map(tip => (
        <div key={tip.id} style={{
          background: 'rgba(6,6,14,0.93)',
          border: '1px solid rgba(255,204,0,0.5)',
          padding: '8px 16px',
          fontFamily: "'VT323', monospace",
          fontSize: '17px',
          color: '#ffcc00',
          letterSpacing: '0.5px',
          textAlign: 'center',
          boxShadow: '0 0 12px rgba(255,204,0,0.15)',
          animation: 'fadeUp .2s ease',
        }}>
          ▶ {tip.text}
        </div>
      ))}
    </div>
  )
}
