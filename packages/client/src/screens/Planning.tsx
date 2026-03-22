import { useState, useRef, useEffect } from 'preact/hooks'
import { connection } from '../net/connection'
import {
  currentRoom, myPlayer, myPlayerId,
  planningSecondsRemaining, chatMessages,
  currentGameState,
} from '../state/client-state'
import { BASIC_MAP } from '@heist/shared'

// ─── Design tokens (match Lobby) ──────────────────────────────────────────────
const R   = '#ff003c'
const G   = '#00ff88'
const B   = '#00cfff'
const P   = '#bf00ff'
const T   = '#c8ffc8'
const D   = '#4a7a4a'
const BG  = '#0a0a0f'
const CARD = '#0c0c16'

// ─── Map overview (SVG room outlines) ─────────────────────────────────────────
function MapOverview({ blurred }: { blurred: boolean }) {
  const map = BASIC_MAP
  const SCALE = 8 // pixels per tile

  return (
    <svg
      viewBox={`0 0 ${map.width * SCALE} ${map.height * SCALE}`}
      style={{
        width: '100%', height: '100%',
        filter: blurred ? 'blur(6px) brightness(0.4)' : 'none',
        transition: 'filter .4s',
      }}
    >
      {/* Background grid */}
      <rect width={map.width * SCALE} height={map.height * SCALE} fill="#060610" />

      {/* Room outlines */}
      {map.rooms.map(room => (
        <rect
          key={room.id}
          x={room.x * SCALE}
          y={room.y * SCALE}
          width={room.width * SCALE}
          height={room.height * SCALE}
          fill="rgba(0,207,255,0.04)"
          stroke={B}
          stroke-width="1"
          opacity="0.6"
        />
      ))}

      {/* Spawn labels */}
      {map.spawnPoints.thieves.map((sp, i) => (
        <circle
          key={`ts${i}`}
          cx={sp.x * SCALE + SCALE / 2}
          cy={sp.y * SCALE + SCALE / 2}
          r={3}
          fill={P}
          opacity="0.7"
        />
      ))}
      <circle
        cx={map.spawnPoints.security[0].x * SCALE + SCALE / 2}
        cy={map.spawnPoints.security[0].y * SCALE + SCALE / 2}
        r={3}
        fill={B}
        opacity="0.7"
      />
    </svg>
  )
}

// ─── Chat sidebar ─────────────────────────────────────────────────────────────
function ChatPanel() {
  const me = myPlayer.value
  const isThief = me?.role === 'thief'
  const messages = chatMessages.value
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function sendMessage() {
    const text = input.trim()
    if (!text || !isThief) return
    connection.send({ type: 'chat', message: text })
    setInput('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      border: `1px solid #1a2a1a`, background: '#08080f',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: `1px solid #1a2a1a`,
        color: D, fontSize: '14px', letterSpacing: '2px',
      }}>
        ◈ CREW COMMS {!isThief && <span style={{ color: R }}>— CLASSIFIED</span>}
      </div>

      {/* Message list */}
      <div data-testid="chat-messages" style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#2a4a2a', fontSize: '16px', letterSpacing: '1px', marginTop: '8px' }}>
            <span style={{ animation: 'blink 1s step-end infinite' }}>_</span> awaiting transmission...
          </div>
        )}
        {messages.map(entry => (
          <div key={entry.id} style={{ fontSize: '18px', lineHeight: '1.3' }}>
            <span style={{ color: P }}>{entry.fromName}:</span>
            {' '}
            <span style={{ color: T }}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isThief && (
        <div style={{ padding: '8px', borderTop: `1px solid #1a2a1a`, display: 'flex', gap: '6px' }}>
          <input
            data-testid="chat-input"
            style={{
              flex: 1, background: '#08080f', border: `1px solid #2a3a2a`,
              color: T, padding: '6px 10px', fontSize: '18px',
              fontFamily: "'VT323', monospace", outline: 'none',
              letterSpacing: '1px',
            }}
            type="text"
            placeholder="transmit..."
            value={input}
            maxLength={200}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button
            onClick={sendMessage}
            style={{
              background: '#1a2a1a', border: `1px solid #2a4a2a`,
              color: G, padding: '6px 12px', cursor: 'pointer',
              fontSize: '18px', fontFamily: "'VT323', monospace",
            }}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Planning screen ──────────────────────────────────────────────────────────
export function Planning() {
  const room     = currentRoom.value
  const me       = myPlayer.value
  const secs     = planningSecondsRemaining.value
  const isThief  = me?.role === 'thief'
  const isSec    = me?.role === 'security'

  const mins    = Math.floor(secs / 60)
  const secPad  = String(secs % 60).padStart(2, '0')
  const urgent  = secs <= 10
  const timerColor = urgent ? R : G

  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      fontFamily: "'VT323', monospace",
    }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: `2px solid #1a2a1a`,
        background: CARD,
      }}>
        <div>
          <span style={{ color: D, fontSize: '16px', letterSpacing: '2px' }}>◈ PLANNING PHASE</span>
          {room && (
            <span style={{ color: '#2a3a2a', fontSize: '16px', marginLeft: '16px', letterSpacing: '2px' }}>
              JOB: {room.id}
            </span>
          )}
        </div>

        {/* Countdown */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '1.6rem', color: timerColor,
          textShadow: urgent ? `0 0 18px ${R}` : `0 0 12px ${G}`,
          transition: 'color .3s, text-shadow .3s',
          letterSpacing: '4px',
        }}
          data-testid="planning-countdown"
        >
          {mins}:{secPad}
        </div>

        <div style={{ color: D, fontSize: '16px', letterSpacing: '2px' }}>
          {isSec  && <span style={{ color: B }}>▶ SECURITY — STUDY THE FLOOR PLAN</span>}
          {isThief && <span style={{ color: P }}>▶ THIEF — PLAN THE JOB</span>}
        </div>
      </div>

      {/* Main area */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isThief ? '1fr 300px' : '1fr',
        overflow: 'hidden',
      }}>

        {/* Map panel */}
        <div data-testid="map-panel" style={{ position: 'relative', overflow: 'hidden', padding: '20px' }}>
          {/* Role instruction overlay for thieves */}
          {isThief && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2, textAlign: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(10,10,15,0.85)', border: `2px solid ${P}`,
                padding: '16px 28px',
                boxShadow: `0 0 30px rgba(191,0,255,.3)`,
              }}>
                <div style={{ color: P, fontSize: '20px', letterSpacing: '3px', marginBottom: '6px' }}>
                  MAP CLASSIFIED
                </div>
                <div style={{ color: D, fontSize: '16px', letterSpacing: '2px' }}>
                  EXIT LOCATION UNKNOWN
                </div>
              </div>
            </div>
          )}
          <MapOverview blurred={isThief} />
        </div>

        {/* Chat panel — thieves only (security sees empty space) */}
        {isThief && (
          <div data-testid="chat-panel" style={{ borderLeft: `1px solid #1a2a1a`, overflow: 'hidden' }}>
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  )
}
