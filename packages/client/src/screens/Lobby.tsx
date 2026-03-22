import { useState, useEffect } from 'preact/hooks'
import type { ServerMessage, PlayerRole, PlayerInfo } from '@heist/shared'
import { connection } from '../net/connection'
import {
  currentRoom, myPlayerId, myPlayerName, myPlayer,
  isSecurityTaken, errorMessage, isLoading,
  setRoom, setError, clearError,
} from '../state/client-state'

// ─── CSS animations injected once ────────────────────────────────────────────
const ANIM_CSS = `
@keyframes glitch {
  0%,87%,100% { transform:none; text-shadow:0 0 8px #ff003c,0 0 22px rgba(255,0,60,.5); clip-path:none }
  88% { text-shadow:-3px 0 #0ff,3px 0 #ff003c; transform:translate(-3px) }
  89% { text-shadow:3px 0 #0ff,-3px 0 #ff003c; transform:translate(3px) }
  90% { clip-path:inset(25% 0 45% 0); transform:translate(-1px) }
  91% { clip-path:inset(55% 0 8% 0); transform:translate(1px) }
  92% { clip-path:none; transform:none }
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes redPulse {
  0%,100%{box-shadow:0 0 0 3px #ff003c,0 0 14px rgba(255,0,60,.3)}
  50%{box-shadow:0 0 0 3px #ff003c,0 0 30px rgba(255,0,60,.7)}
}
@keyframes greenPulse {
  0%,100%{box-shadow:0 0 0 3px #00ff88,0 0 12px rgba(0,255,136,.25)}
  50%{box-shadow:0 0 0 3px #00ff88,0 0 26px rgba(0,255,136,.6)}
}
@keyframes rowIn {
  from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)}
}
@keyframes joinExpand {
  from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)}
}

.ht { font-family:'Press Start 2P',monospace; animation:glitch 5s infinite; display:inline-block }
.fade-up { animation:fadeUp .22s ease }
.join-expand { animation:joinExpand .2s ease }
.blink { animation:blink 1s step-end infinite }
.rcode { font-family:'Press Start 2P',monospace; animation:redPulse 2.5s ease-in-out infinite }
.ready-glow { animation:greenPulse 2s ease-in-out infinite }

.pbtn {
  cursor:pointer; font-family:'VT323',monospace; font-size:22px;
  letter-spacing:1px; border:none; user-select:none;
  transition:filter .1s; position:relative;
}
.pbtn::after {
  content:''; position:absolute; bottom:-4px; right:-4px;
  width:100%; height:100%; background:rgba(0,0,0,.5); z-index:-1;
}
.pbtn:hover:not(:disabled) { filter:brightness(1.25) }
.pbtn:active:not(:disabled) { transform:translate(3px,3px) }
.pbtn:active:not(:disabled)::after { display:none }
.pbtn:disabled { opacity:.35; cursor:not-allowed }

.pinput {
  font-family:'VT323',monospace; font-size:22px;
  outline:none; background:#080810;
  transition:box-shadow .15s;
}
.pinput:focus { box-shadow:0 0 0 2px #ff003c,0 0 16px rgba(255,0,60,.4) !important }

.prow { transition:background .12s }
.prow:hover { background:rgba(255,0,60,.06) }

::selection { background:#ff003c; color:#0a0a0f }
::-webkit-scrollbar { width:6px }
::-webkit-scrollbar-track { background:#0a0a0f }
::-webkit-scrollbar-thumb { background:#ff003c }
`

function injectCSS() {
  if (document.getElementById('heist-anim')) return
  const s = document.createElement('style')
  s.id = 'heist-anim'
  s.textContent = ANIM_CSS
  document.head.prepend(s)
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const R  = '#ff003c'
const G  = '#00ff88'
const B  = '#00cfff'
const P  = '#bf00ff'
const T  = '#c8ffc8'
const D  = '#4a7a4a'
const BG = '#0a0a0f'
const CARD = '#0c0c16'

// ─── Component ────────────────────────────────────────────────────────────────
export function Lobby() {
  const [playerName, setPlayerName] = useState('')
  const [joinCode,   setJoinCode]   = useState('')
  const [view,       setView]       = useState<'home' | 'in-room'>('home')
  const [joinMode,   setJoinMode]   = useState(false)

  const room          = currentRoom.value
  const me            = myPlayer.value
  const error         = errorMessage.value
  const loading       = isLoading.value
  const secTaken      = isSecurityTaken.value

  useEffect(() => {
    injectCSS()
    connection.connect()

    const unsub = connection.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created':
          myPlayerId.value = msg.playerId
          currentRoom.value = null
          setView('in-room')
          clearError()
          break
        case 'room_joined':
          myPlayerId.value = msg.playerId
          setView('in-room')
          clearError()
          break
        case 'room_state':
          setRoom(msg.room)
          isLoading.value = false
          break
        case 'player_updated':
          if (currentRoom.value) {
            const idx = currentRoom.value.players.findIndex((p: PlayerInfo) => p.id === msg.player.id)
            if (idx >= 0) {
              const players = [...currentRoom.value.players]
              players[idx] = msg.player
              currentRoom.value = { ...currentRoom.value, players }
            }
          }
          break
        case 'player_left':
          if (currentRoom.value) {
            currentRoom.value = {
              ...currentRoom.value,
              players: currentRoom.value.players.filter((p: PlayerInfo) => p.id !== msg.playerId),
            }
          }
          break
        case 'phase_change':
          if (currentRoom.value) {
            currentRoom.value = { ...currentRoom.value, phase: msg.phase }
          }
          break
        case 'error':
          setError(msg.message)
          isLoading.value = false
          break
      }
    })

    return unsub
  }, [])

  function handleCreateRoom() {
    if (!playerName.trim()) { setError('ENTER YOUR CALLSIGN FIRST.'); return }
    myPlayerName.value = playerName.trim()
    isLoading.value = true
    clearError()
    connection.send({ type: 'create_room', playerName: playerName.trim() })
  }

  function handleJoinRoom() {
    if (!playerName.trim()) { setError('ENTER YOUR CALLSIGN FIRST.'); return }
    if (joinCode.trim().length !== 6) { setError('JOB CODE MUST BE 6 CHARACTERS.'); return }
    myPlayerName.value = playerName.trim()
    isLoading.value = true
    clearError()
    connection.send({ type: 'join_room', roomId: joinCode.trim().toUpperCase(), playerName: playerName.trim() })
  }

  function handleSelectRole(role: PlayerRole) {
    clearError()
    connection.send({ type: 'select_role', role })
  }

  function handleToggleReady() {
    clearError()
    connection.send({ type: 'set_ready', ready: !(me?.ready ?? false) })
  }

  function handleLeaveRoom() {
    connection.disconnect()
    connection.connect()
    currentRoom.value = null
    myPlayerId.value  = null
    myPlayerName.value = ''
    isLoading.value   = false
    clearError()
    setView('home')
    setJoinMode(false)
  }

  // ─── Shared style helpers ──────────────────────────────────────────────────
  const pageWrap = {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '20px', background: BG,
  }

  const card = {
    background: CARD, border: `2px solid ${R}`,
    boxShadow: `4px 4px 0 #6b0000, 0 0 40px rgba(255,0,60,.12)`,
    padding: '32px', width: '100%', maxWidth: '480px',
  }

  const label = {
    display: 'block', color: D, fontSize: '16px',
    letterSpacing: '2px', marginBottom: '8px',
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: `2px solid #1a301a`, color: T,
    letterSpacing: '1px',
  }

  const badge = (borderCol: string, textCol: string, bgAlpha = 0.08) => ({
    padding: '1px 8px', fontSize: '16px', letterSpacing: '1px',
    border: `1px solid ${borderCol}`, color: textCol,
    background: `rgba(${hexToRgb(borderCol)},${bgAlpha})`,
    whiteSpace: 'nowrap' as const,
  })

  const errorBanner = error ? (
    <div style={{
      background: '#180008', border: `2px solid ${R}`,
      padding: '10px 14px', color: R, fontSize: '18px',
      marginBottom: '18px', letterSpacing: '1px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span>⚠ {error}</span>
      <button onClick={clearError}
        style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: '20px', padding: '0 4px' }}>
        ✕
      </button>
    </div>
  ) : null

  // ─── Waiting for room data ─────────────────────────────────────────────────
  if (view === 'in-room' && !room) {
    return (
      <div style={pageWrap}>
        <div class="fade-up" style={card}>
          <p style={{ textAlign: 'center', color: D, letterSpacing: '3px', fontSize: '20px' }}>
            ◈ ESTABLISHING SECURE LINK <span class="blink">_</span>
          </p>
        </div>
      </div>
    )
  }

  // ─── In-room view ──────────────────────────────────────────────────────────
  if (view === 'in-room' && room) {
    const canReady = me?.role !== 'unassigned'
    return (
      <div style={pageWrap}>
        <div class="fade-up" style={{ ...card, maxWidth: '520px' }}>

          {/* Room header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ ...label, marginBottom: 0 }}>◈ JOB CODE</span>
            <span style={{ ...label, marginBottom: 0 }}>{room.players.length}/5 AGENTS</span>
          </div>

          <div class="rcode" style={{
            textAlign: 'center', color: R, padding: '14px 10px',
            marginBottom: '24px', background: '#100008',
            fontSize: '2rem', letterSpacing: '0.35em',
          }}>
            {room.id}
          </div>

          {errorBanner}

          {/* Role selection */}
          {!me?.ready && (
            <div style={{ marginBottom: '18px' }}>
              <span style={label}>◈ SELECT ROLE</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button class="pbtn" style={{
                  flex: 1, padding: '12px 8px',
                  background: me?.role === 'security' ? B : '#080818',
                  color: me?.role === 'security' ? CARD : B,
                  border: `2px solid ${B}`,
                  boxShadow: me?.role === 'security'
                    ? `3px 3px 0 #004f6b, 0 0 14px rgba(0,207,255,.4)`
                    : `3px 3px 0 #002c3d`,
                  opacity: secTaken && me?.role !== 'security' ? 0.35 : 1,
                }}
                  onClick={() => (!secTaken || me?.role === 'security') && handleSelectRole('security')}
                  disabled={secTaken && me?.role !== 'security'}
                >
                  {me?.role === 'security' ? '▶ SECURITY' : 'SECURITY'}
                  {secTaken && me?.role !== 'security' ? ' ✗' : ''}
                </button>
                <button class="pbtn" style={{
                  flex: 1, padding: '12px 8px',
                  background: me?.role === 'thief' ? P : '#0a0012',
                  color: me?.role === 'thief' ? CARD : P,
                  border: `2px solid ${P}`,
                  boxShadow: me?.role === 'thief'
                    ? `3px 3px 0 #5a0077, 0 0 14px rgba(191,0,255,.4)`
                    : `3px 3px 0 #2e0040`,
                }}
                  onClick={() => handleSelectRole('thief')}
                >
                  {me?.role === 'thief' ? '▶ THIEF' : 'THIEF'}
                </button>
              </div>
            </div>
          )}

          {/* Ready button */}
          <button class={`pbtn${me?.ready ? ' ready-glow' : ''}`} style={{
            width: '100%', padding: '14px',
            marginBottom: '24px',
            background: me?.ready ? G : canReady ? R : '#1a1a1a',
            color: (me?.ready || canReady) ? CARD : D,
            fontSize: '24px', fontWeight: 700, letterSpacing: '2px',
            boxShadow: me?.ready
              ? `4px 4px 0 #006644`
              : canReady ? `4px 4px 0 #6b0000` : `4px 4px 0 #111`,
          }}
            onClick={handleToggleReady}
            disabled={!canReady}
          >
            {me?.ready ? '■ CANCEL READY' : canReady ? '▶ READY UP' : 'SELECT A ROLE FIRST'}
          </button>

          {/* Player list */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderBottom: `1px solid #1a261a`, paddingBottom: '6px', marginBottom: '4px',
          }}>
            <span style={{ ...label, marginBottom: 0, fontSize: '15px' }}>◈ CREW MANIFEST</span>
          </div>
          <ul style={{ listStyle: 'none' }}>
            {room.players.map((p: PlayerInfo, i: number) => (
              <li key={p.id} class="prow" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 6px',
                borderBottom: `1px solid #101810`,
                fontSize: '20px',
                animation: `rowIn 0.2s ${i * 0.06}s ease both`,
              }}>
                <span style={{ color: p.connected ? D : '#333', width: '16px', flexShrink: 0 }}>
                  {p.connected ? '◈' : '○'}
                </span>
                <span style={{ flex: 1, color: p.id === myPlayerId.value ? T : '#8ab88a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                  {p.id === room.hostId     && <span style={{ color: D, fontSize: '14px', marginLeft: '6px' }}>[HOST]</span>}
                  {p.id === myPlayerId.value && <span style={{ color: D, fontSize: '14px', marginLeft: '6px' }}>[YOU]</span>}
                </span>
                <span style={badge(
                  p.role === 'security' ? B : p.role === 'thief' ? P : '#2a3a2a',
                  p.role === 'security' ? B : p.role === 'thief' ? P : D,
                )}>
                  {p.role.toUpperCase()}
                </span>
                {p.ready && <span style={badge(G, G)}> READY</span>}
                {!p.connected && <span style={badge('#ff8800', '#ff8800')}>OFFLINE</span>}
              </li>
            ))}
          </ul>

          {/* Leave */}
          <button class="pbtn" style={{
            width: '100%', padding: '12px', marginTop: '24px',
            background: 'transparent', color: '#3a5a3a', fontSize: '18px',
            letterSpacing: '2px', border: `2px solid #1a2a1a`,
            boxShadow: `3px 3px 0 #0a0f0a`,
          }}
            onClick={handleLeaveRoom}
          >
            ← ABORT MISSION
          </button>
        </div>
      </div>
    )
  }

  // ─── Home view ─────────────────────────────────────────────────────────────
  return (
    <div style={pageWrap}>
      <div class="fade-up" style={card}>

        {/* Title block */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', color: D, letterSpacing: '3px', marginBottom: '10px' }}>
            ▶ SYS ONLINE <span class="blink">■</span>
          </div>
          <h1 class="ht" style={{ fontSize: '2.5rem', color: R, margin: '0 0 10px', letterSpacing: '6px' }}>
            HEIST
          </h1>
          <p style={{ color: D, letterSpacing: '2px', fontSize: '17px' }}>
            1v4 ASYMMETRIC MULTIPLAYER
          </p>
        </div>

        {errorBanner}

        {/* Name input */}
        <label style={label}>◈ YOUR CALLSIGN</label>
        <input class="pinput" style={{ ...inputStyle, marginBottom: '22px' }}
          type="text"
          placeholder="Enter callsign..."
          value={playerName}
          onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)}
          maxLength={24}
        />

        {!joinMode ? (
          /* Action choice */
          <div style={{ display: 'flex', gap: '12px' }}>
            <button class="pbtn" style={{
              flex: 1, padding: '16px 8px',
              background: R, color: CARD,
              fontWeight: 700, fontSize: '22px', letterSpacing: '1px',
              boxShadow: `4px 4px 0 #6b0000`,
            }}
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? '▶ PLANNING…' : '▶ HOST A JOB'}
            </button>
            <button class="pbtn" style={{
              flex: 1, padding: '16px 8px',
              background: 'transparent', color: T,
              fontSize: '22px', letterSpacing: '1px',
              border: `2px solid #1e3a1e`,
              boxShadow: `4px 4px 0 #0a130a`,
            }}
              onClick={() => { clearError(); setJoinMode(true) }}
              disabled={loading}
            >
              ▷ JOIN A CREW
            </button>
          </div>
        ) : (
          /* Join panel */
          <div class="join-expand">
            <label style={label}>◈ JOB CODE</label>
            <input class="pinput" style={{
              ...inputStyle,
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '16px', letterSpacing: '0.35em',
              textAlign: 'center', textTransform: 'uppercase',
              marginBottom: '14px',
            }}
              type="text"
              placeholder="XXXXXX"
              value={joinCode}
              onInput={(e) => setJoinCode((e.target as HTMLInputElement).value.toUpperCase())}
              maxLength={6}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button class="pbtn" style={{
                padding: '14px 18px',
                background: 'transparent', color: D,
                border: `2px solid #1a2a1a`, fontSize: '20px',
                boxShadow: `3px 3px 0 #0a0f0a`,
              }}
                onClick={() => { setJoinMode(false); setJoinCode(''); clearError() }}
                disabled={loading}
              >
                ← BACK
              </button>
              <button class="pbtn" style={{
                flex: 1, padding: '14px',
                background: R, color: CARD,
                fontWeight: 700, fontSize: '22px', letterSpacing: '1px',
                boxShadow: `4px 4px 0 #6b0000`,
              }}
                onClick={handleJoinRoom}
                disabled={loading}
              >
                {loading ? '▶ LINKING…' : '▶ CRACK IN'}
              </button>
            </div>
          </div>
        )}

        {/* Status footer */}
        <div style={{
          marginTop: '28px', borderTop: `1px solid #121e12`,
          paddingTop: '14px', textAlign: 'center',
          color: '#1e3e1e', fontSize: '14px', letterSpacing: '2px',
        }}>
          <span>SECURE CHANNEL</span>
          <span class="blink" style={{ marginLeft: '6px', color: '#1a8c1a' }}>●</span>
        </div>
      </div>
    </div>
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
