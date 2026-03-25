/**
 * TipOverlay — contextual in-game tips for thieves.
 *
 * Tips are triggered by game state changes (alarm, loot picked up, etc.),
 * shown for 5 seconds then auto-dismissed. Each tip is only shown once
 * per session.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { GameState } from '@heist/shared'

interface Tip {
  id: string
  text: string
}

const TIPS: Record<string, string> = {
  alarm_triggered:  '! Click the alarm panel (!) to disable the alarm and restore the timer',
  first_loot:       'You slow down with each item carried. You only need 3 items to escape!',
  loot_full:        'Loot bag full (3/3) — head to the exit NOW',
  near_locked_door: 'Click a locked door to pick the lock (takes 4 seconds)',
  near_camera:      'Click a camera to destroy it (takes 5 seconds)',
}

const DISPLAY_MS = 5000

export function TipOverlay({ gs, myId }: { gs: GameState | null; myId: string | null }) {
  const [activeTips, setActiveTips] = useState<Tip[]>([])
  const shown = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function showTip(id: string) {
    if (shown.current.has(id)) return
    shown.current.add(id)
    const text = TIPS[id]
    if (!text) return

    setActiveTips(prev => [...prev, { id, text }])
    const timer = setTimeout(() => {
      setActiveTips(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, DISPLAY_MS)
    timers.current.set(id, timer)
  }

  // Alarm triggered
  useEffect(() => {
    if (gs?.alarmTriggered) showTip('alarm_triggered')
  }, [gs?.alarmTriggered])

  // Loot carried changes — derive primitive so the dep array uses stable equality
  const lootCount = gs?.playerPositions.find(p => p.playerId === myId)?.lootCarried.length ?? 0
  useEffect(() => {
    if (!gs || !myId) return
    if (lootCount >= 1) showTip('first_loot')
    if (lootCount >= 3) showTip('loot_full')
  }, [lootCount, myId])

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
      maxWidth: '380px',
      width: '90%',
    }}>
      {activeTips.map(tip => (
        <div key={tip.id} style={{
          background: 'rgba(6,6,14,0.92)',
          border: '1px solid rgba(255,204,0,0.5)',
          padding: '7px 14px',
          fontFamily: "'VT323', monospace",
          fontSize: '16px',
          color: '#ffcc00',
          letterSpacing: '0.5px',
          textAlign: 'center',
          boxShadow: '0 0 10px rgba(255,204,0,0.15)',
          animation: 'fadeUp .2s ease',
        }}>
          ▶ {tip.text}
        </div>
      ))}
    </div>
  )
}
