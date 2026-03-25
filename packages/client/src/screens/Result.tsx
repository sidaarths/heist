/**
 * Result.tsx — Game-over resolution screen.
 *
 * Shows the winner (Thieves / Security), a reason string, and a
 * "Play Again" button that resets the room back to the lobby phase.
 *
 * Rendered when gamePhase === 'resolution'.
 */
import { connection } from '../net/connection'
import {
  currentRoom,
  myPlayerId,
  myPlayerName,
  gameOverResult,
  clearGameOver,
  clearChatMessages,
} from '../state/client-state'

// ─── Design tokens ─────────────────────────────────────────────────────────
const R  = '#ff003c'
const G  = '#00ff88'
const B  = '#00cfff'
const P  = '#bf00ff'
const T  = '#c8ffc8'
const D  = '#4a7a4a'
const BG = '#0a0a0f'
const CARD = '#0c0c16'

const ANIM_STYLE = `
  @keyframes resultGlitch {
    0%,88%,100% { transform:none }
    89% { transform:translate(-4px,1px) skewX(-3deg) }
    90% { transform:translate(4px,-1px) skewX(3deg) }
    91% { transform:none }
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
`

function injectCSS() {
  if (document.getElementById('result-anim')) return
  const s = document.createElement('style')
  s.id = 'result-anim'
  s.textContent = ANIM_STYLE
  document.head.prepend(s)
}

// ─── Component ───────────────────────────────────────────────────────────────
export function Result() {
  injectCSS()

  const result = gameOverResult.value
  const winner = result?.winner ?? 'security'
  const reason = result?.reason ?? ''

  const isThievesWin = winner === 'thieves'

  const accentColor = isThievesWin ? P : R
  const headline    = isThievesWin ? 'MISSION ACCOMPLISHED' : 'ACCESS DENIED'
  const subtitle    = isThievesWin ? 'THE CREW GOT AWAY' : 'LOCKDOWN COMPLETE'

  const room = currentRoom.value
  const isHost = room?.hostId === myPlayerId.value

  function handlePlayAgain() {
    clearGameOver()
    clearChatMessages()
    // Host sends reset_room to server; server broadcasts room_state to all players.
    // Non-host players will receive the room_state and route back to Lobby automatically.
    if (isHost) {
      connection.send({ type: 'reset_room' })
    }
  }

  function handleWatchReplay() {
    connection.send({ type: 'request_replay' })
  }

  return (
    <div
      data-testid="result-screen"
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'VT323', monospace",
        padding: '20px',
      }}
    >
      <div style={{
        textAlign: 'center',
        animation: 'fadeUp .4s ease',
        maxWidth: '600px',
        width: '100%',
      }}>

        {/* Headline */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 'clamp(1.4rem, 4vw, 2.6rem)',
          color: accentColor,
          textShadow: `0 0 30px ${accentColor}`,
          marginBottom: '12px',
          animation: 'resultGlitch 4s infinite',
          letterSpacing: '4px',
        }}
          data-testid="result-winner"
        >
          {headline}
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 'clamp(0.7rem, 2vw, 1.1rem)',
          color: isThievesWin ? '#bf80ff' : '#ff8080',
          letterSpacing: '3px',
          marginBottom: '30px',
          opacity: 0.85,
        }}>
          {subtitle}
        </div>

        {/* Reason box */}
        {reason && (
          <div style={{
            background: CARD,
            border: `1px solid ${accentColor}`,
            padding: '16px 24px',
            marginBottom: '32px',
            color: T,
            fontSize: '22px',
            letterSpacing: '1px',
            boxShadow: `0 0 20px rgba(255,0,60,.1)`,
          }}
            data-testid="result-reason"
          >
            {reason}
          </div>
        )}

        {/* Winner badge */}
        <div style={{
          display: 'inline-block',
          padding: '8px 24px',
          border: `2px solid ${accentColor}`,
          color: accentColor,
          fontSize: '28px',
          letterSpacing: '2px',
          marginBottom: '40px',
          background: `rgba(${isThievesWin ? '191,0,255' : '255,0,60'},.08)`,
          boxShadow: `0 0 20px ${accentColor}33`,
        }}>
          {isThievesWin ? '◈ THIEVES WIN' : '◈ SECURITY WINS'}
        </div>

        {/* Play Again + Watch Replay */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            data-testid="play-again-btn"
            onClick={handlePlayAgain}
            style={{
              padding: '18px 48px',
              background: G,
              color: BG,
              border: 'none',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '14px',
              letterSpacing: '2px',
              cursor: 'pointer',
              boxShadow: `4px 4px 0 #006644, 0 0 24px rgba(0,255,136,.3)`,
              transition: 'filter .1s',
            }}
          >
            ▶ PLAY AGAIN
          </button>
          <button
            data-testid="watch-replay-btn"
            onClick={handleWatchReplay}
            style={{
              padding: '18px 48px',
              background: 'transparent',
              color: B,
              border: `2px solid ${B}`,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '14px',
              letterSpacing: '2px',
              cursor: 'pointer',
              boxShadow: `0 0 24px rgba(0,207,255,.2)`,
              transition: 'filter .1s',
            }}
          >
            ◈ WATCH REPLAY
          </button>
        </div>

        {/* Blink cursor decoration */}
        <div style={{
          marginTop: '28px',
          color: D,
          fontSize: '18px',
          letterSpacing: '2px',
        }}>
          <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
        </div>

      </div>
    </div>
  )
}
