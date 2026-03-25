import { useState, useEffect, useRef } from 'preact/hooks'
import type { PlayerRole, PlayerInfo } from '@heist/shared' // PlayerInfo used in room.players.map
import { connection } from '../net/connection'
import {
  currentRoom, myPlayerId, myPlayerName, myPlayer,
  isSecurityTaken, errorMessage, isLoading,
  setError, clearError, clearChatMessages,
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
  const [joinMode,   setJoinMode]   = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showRules,  setShowRules]  = useState(false)
  const copyCodeTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyLinkTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-fill join code from ?room=XXXXXX URL parameter.
  // Validate against the same alphanumeric pattern the server enforces so
  // a crafted URL can never inject arbitrary bytes into the join message.
  useEffect(() => {
    const ROOM_CODE_RE = /^[A-Z0-9]{6}$/
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('room')
    if (!raw) return
    const normalised = raw.toUpperCase()
    if (ROOM_CODE_RE.test(normalised)) {
      setJoinCode(normalised)
      setJoinMode(true)
    }
  }, [])

  const room     = currentRoom.value
  const me       = myPlayer.value
  const error    = errorMessage.value
  const loading  = isLoading.value
  const secTaken = isSecurityTaken.value

  // Derive view from signals — no local state needed
  const inRoom  = myPlayerId.value !== null
  const isHost  = room?.hostId === myPlayerId.value

  // Start game readiness checks (evaluated client-side for UI feedback)
  const allReady        = room ? room.players.every(p => p.ready) : false
  const hasSecurity     = room ? room.players.some(p => p.role === 'security') : false
  const allAssigned     = room ? room.players.every(p => p.role !== 'unassigned') : false
  const enoughPlayers   = room ? room.players.length >= 2 : false
  const canStart        = allReady && hasSecurity && allAssigned && enoughPlayers

  function startBlockReason(): string {
    if (!enoughPlayers) return `NEED ${2 - (room?.players.length ?? 0)} MORE PLAYER(S)`
    if (!hasSecurity)   return 'NO SECURITY ASSIGNED'
    if (!allAssigned)   return 'ALL PLAYERS MUST SELECT A ROLE'
    if (!allReady)      return 'WAITING FOR ALL TO READY UP'
    return ''
  }

  useEffect(() => {
    injectCSS()
  }, [])

  function handleCreateRoom() {
    if (!playerName.trim()) { setError('ENTER YOUR CALLSIGN FIRST.'); return }
    myPlayerName.value = playerName.trim()
    isLoading.value = true; clearError()
    connection.send({ type: 'create_room', playerName: playerName.trim() })
  }

  function handleJoinRoom() {
    if (!playerName.trim()) { setError('ENTER YOUR CALLSIGN FIRST.'); return }
    if (joinCode.trim().length !== 6) { setError('JOB CODE MUST BE 6 CHARACTERS.'); return }
    myPlayerName.value = playerName.trim()
    isLoading.value = true; clearError()
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

  function handleCopyCode() {
    if (!room) return
    navigator.clipboard.writeText(room.id).then(() => {
      setCopiedCode(true)
      if (copyCodeTimer.current) clearTimeout(copyCodeTimer.current)
      copyCodeTimer.current = setTimeout(() => setCopiedCode(false), 1800)
    }).catch(() => setError('CLIPBOARD ACCESS DENIED.'))
  }

  function handleCopyLink() {
    if (!room) return
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true)
      if (copyLinkTimer.current) clearTimeout(copyLinkTimer.current)
      copyLinkTimer.current = setTimeout(() => setCopiedLink(false), 1800)
    }).catch(() => setError('CLIPBOARD ACCESS DENIED.'))
  }

  function handleStartGame() {
    clearError()
    connection.send({ type: 'start_game' })
  }

  function handleLeaveRoom() {
    connection.disconnect()
    connection.connect()
    currentRoom.value = null
    myPlayerId.value  = null
    myPlayerName.value = ''
    isLoading.value   = false
    clearError()
    clearChatMessages()
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
  if (inRoom && !room) {
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
  if (inRoom && room) {
    const canReady = me?.role !== 'unassigned'
    return (
      <div style={pageWrap}>
        <div class="fade-up" style={{ ...card, maxWidth: '520px' }}>

          {/* Room header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ ...label, marginBottom: 0 }}>◈ JOB CODE</span>
            <span data-testid="player-count" style={{ ...label, marginBottom: 0 }}>{room.players.length}/5 AGENTS</span>
          </div>

          {/* Room code — click to copy the bare code */}
          <div
            data-testid="room-code"
            class="rcode"
            role="button"
            tabIndex={0}
            onClick={handleCopyCode}
            onKeyDown={(e) => e.key === 'Enter' && handleCopyCode()}
            aria-label={`Copy room code ${room.id}`}
            title="Click to copy code"
            style={{
              textAlign: 'center', color: copiedCode ? G : R,
              padding: '14px 10px', marginBottom: '8px',
              background: '#100008', cursor: 'pointer',
              fontSize: '2rem', letterSpacing: '0.35em',
              transition: 'color .2s',
            }}
          >
            {room.id}
            <div style={{ fontSize: '13px', letterSpacing: '2px', marginTop: '6px', fontFamily: "'VT323', monospace", opacity: 0.7 }}>
              {copiedCode ? '✓ CODE COPIED' : 'CLICK TO COPY CODE'}
            </div>
          </div>

          {/* Invite link button */}
          <button
            onClick={handleCopyLink}
            style={{
              display: 'block', width: '100%',
              marginBottom: '24px', padding: '8px',
              background: 'transparent',
              border: `1px solid ${copiedLink ? G : 'rgba(200,255,200,0.2)'}`,
              color: copiedLink ? G : 'rgba(200,255,200,0.55)',
              fontFamily: "'VT323', monospace",
              fontSize: '14px', letterSpacing: '2px',
              cursor: 'pointer', transition: 'color .2s, border-color .2s',
            }}
          >
            {copiedLink ? '✓ INVITE LINK COPIED' : '⎘ COPY INVITE LINK'}
          </button>

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
                  data-testid="security-btn"
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
                  data-testid="thief-btn"
                  onClick={() => handleSelectRole('thief')}
                >
                  {me?.role === 'thief' ? '▶ THIEF' : 'THIEF'}
                </button>
              </div>
            </div>
          )}

          {/* Ready button */}
          <button data-testid="ready-btn" class={`pbtn${me?.ready ? ' ready-glow' : ''}`} style={{
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

          {/* Start game — host only */}
          {isHost && (
            <div style={{ marginBottom: '24px' }}>
              <button
                data-testid="start-game-btn"
                class="pbtn"
                style={{
                  width: '100%', padding: '16px',
                  background: canStart ? G : '#0d1a0d',
                  color: canStart ? CARD : D,
                  fontSize: '22px', fontWeight: 700, letterSpacing: '2px',
                  boxShadow: canStart ? `4px 4px 0 #006644, 0 0 20px rgba(0,255,136,.2)` : `4px 4px 0 #060d06`,
                  border: `2px solid ${canStart ? G : '#1a3a1a'}`,
                  transition: 'all .2s',
                }}
                onClick={handleStartGame}
                disabled={!canStart}
              >
                {canStart ? '▶ LAUNCH HEIST' : `⚠ ${startBlockReason()}`}
              </button>
            </div>
          )}

          {/* Non-host: show what's blocking start */}
          {!isHost && !canStart && (
            <div style={{
              marginBottom: '20px', padding: '10px 14px',
              border: `1px solid #1a2a1a`, color: D,
              fontSize: '17px', letterSpacing: '1px', textAlign: 'center',
            }}>
              ⏳ {startBlockReason()}
            </div>
          )}

          {/* Player list */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderBottom: `1px solid #1a261a`, paddingBottom: '6px', marginBottom: '4px',
          }}>
            <span style={{ ...label, marginBottom: 0, fontSize: '15px' }}>◈ CREW MANIFEST</span>
          </div>
          <ul style={{ listStyle: 'none' }}>
            {room.players.map((p: PlayerInfo, i: number) => (
              <li key={p.id} data-testid="player-row" class="prow" style={{
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
                {p.ready && <span data-testid="ready-badge" style={badge(G, G)}> READY</span>}
                {!p.connected && <span style={badge('#ff8800', '#ff8800')}>OFFLINE</span>}
              </li>
            ))}
          </ul>

          {/* How to Play */}
          <div style={{ marginTop: '20px' }}>
            <button
              onClick={() => setShowRules(r => !r)}
              style={{
                width: '100%', padding: '9px',
                background: 'transparent',
                border: `1px solid ${showRules ? B : '#1a2a3a'}`,
                color: showRules ? B : '#2a4a5a',
                fontFamily: "'VT323', monospace",
                fontSize: '16px', letterSpacing: '2px',
                cursor: 'pointer', transition: 'color .15s, border-color .15s',
              }}
            >
              {showRules ? '▼ HOW TO PLAY' : '▶ HOW TO PLAY'}
            </button>
            {showRules && (
              <div class="join-expand" style={{
                marginTop: '6px', padding: '14px 16px',
                background: '#06080f',
                border: `1px solid ${B}22`,
                fontSize: '17px', lineHeight: '1.6',
                fontFamily: "'VT323', monospace",
              }}>
                {(!me?.role || me.role === 'unassigned') && (
                  <RulesGeneral />
                )}
                {me?.role === 'thief' && (
                  <RulesThief />
                )}
                {me?.role === 'security' && (
                  <RulesSecurity />
                )}
              </div>
            )}
          </div>

          {/* Leave */}
          <button class="pbtn" style={{
            width: '100%', padding: '12px', marginTop: '16px',
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
        <input data-testid="callsign-input" class="pinput" style={{ ...inputStyle, marginBottom: '22px' }}
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
              data-testid="host-btn"
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
              data-testid="join-btn"
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
            <input data-testid="join-code-input" class="pinput" style={{
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
                data-testid="crack-in-btn"
                onClick={handleJoinRoom}
                disabled={loading}
              >
                {loading ? '▶ LINKING…' : '▶ CRACK IN'}
              </button>
            </div>
          </div>
        )}

        {/* Objective blurb */}
        <div style={{
          marginTop: '22px', padding: '12px 14px',
          border: `1px solid #1a2a3a`, background: '#06080f',
          fontFamily: "'VT323', monospace", fontSize: '17px',
          color: '#3a6a7a', letterSpacing: '1px', lineHeight: '1.55',
        }}>
          <span style={{ color: B, letterSpacing: '2px' }}>◈ OBJECTIVE</span>
          <br />
          <span style={{ color: '#5a8a9a' }}>
            1 Security vs up to 4 Thieves.
          </span>
          <br />
          <span style={{ color: '#3a5a6a' }}>
            Thieves steal 3 loot items &amp; escape to the EXIT.
            Security must catch every thief before they get out.
          </span>
        </div>

        {/* Status footer */}
        <div style={{
          marginTop: '18px', borderTop: `1px solid #121e12`,
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

// ─── Rules panels ─────────────────────────────────────────────────────────────
const B_COL  = '#00cfff'
const P_COL  = '#bf00ff'
const G_COL  = '#00ff88'
const R_COL  = '#ff003c'
const D_COL  = '#4a7a4a'

function RulesRow({ icon, text, col = '#7aaa7a' }: { icon: string; text: string; col?: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'flex-start' }}>
      <span style={{ color: col, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#8ab88a' }}>{text}</span>
    </div>
  )
}

function RulesGeneral() {
  return (
    <div>
      <div style={{ color: B_COL, marginBottom: '8px', letterSpacing: '2px', fontSize: '15px' }}>OVERVIEW</div>
      <RulesRow icon="◈" text="1 Security officer vs up to 4 Thieves." col={B_COL} />
      <RulesRow icon="◈" text="Thieves steal 3 loot items from rooms and escape through the EXIT." col={P_COL} />
      <RulesRow icon="◈" text="Security must catch every thief before they escape." col={R_COL} />
      <div style={{ color: D_COL, marginTop: '8px', letterSpacing: '2px', fontSize: '15px' }}>SELECT A ROLE TO SEE YOUR BRIEFING</div>
    </div>
  )
}

function RulesThief() {
  return (
    <div>
      <div style={{ color: P_COL, marginBottom: '8px', letterSpacing: '2px', fontSize: '15px' }}>THIEF BRIEFING</div>
      <RulesRow icon="▶" text="Steal 3 loot items — they auto-pickup when you walk close." col={G_COL} />
      <RulesRow icon="▶" text="Reach the EXIT tile while carrying loot to win." col={G_COL} />
      <RulesRow icon="▶" text="Each item you carry slows you down — 3 is the max." col={P_COL} />
      <div style={{ color: B_COL, marginTop: '8px', marginBottom: '4px', letterSpacing: '2px', fontSize: '15px' }}>CONTROLS</div>
      <RulesRow icon="⌨" text="WASD or Arrow Keys to move." col={B_COL} />
      <RulesRow icon="⌨" text="Click a locked door nearby to pick the lock (4 sec)." col={B_COL} />
      <RulesRow icon="⌨" text="Click a camera nearby to destroy it (5 sec) before it spots you." col={B_COL} />
      <RulesRow icon="⌨" text="Click an alarm panel (!) to disable an active alarm." col={B_COL} />
      <div style={{ color: R_COL, marginTop: '8px', marginBottom: '4px', letterSpacing: '2px', fontSize: '15px' }}>WATCH OUT</div>
      <RulesRow icon="!" text="Camera spots you → alarm triggers. Disable it or the timer shrinks fast." col={R_COL} />
      <RulesRow icon="!" text="Guard within 1.5 tiles → frozen for 5 seconds." col={R_COL} />
    </div>
  )
}

function RulesSecurity() {
  return (
    <div>
      <div style={{ color: B_COL, marginBottom: '8px', letterSpacing: '2px', fontSize: '15px' }}>SECURITY BRIEFING</div>
      <RulesRow icon="▶" text="You see the entire map — thieves only see a limited radius." col={B_COL} />
      <RulesRow icon="▶" text="Freeze thieves by deploying a guard near them (1.5-tile range)." col={B_COL} />
      <RulesRow icon="▶" text="Win by catching all thieves before any escape with 3 loot." col={R_COL} />
      <div style={{ color: B_COL, marginTop: '8px', marginBottom: '4px', letterSpacing: '2px', fontSize: '15px' }}>ABILITIES</div>
      <RulesRow icon="◉" text="CUT LIGHTS — blinds all thieves for 8 seconds (3 uses per game)." col={P_COL} />
      <RulesRow icon="◉" text="TRIGGER ALARM — activates the alarm immediately; shrinks escape timer." col={R_COL} />
      <RulesRow icon="◉" text="Cameras auto-alert when thieves walk into their field of view." col={B_COL} />
    </div>
  )
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
