import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { ServerMessage, PlayerRole, PlayerInfo } from '@heist/shared'
import { connection } from '../net/connection'
import {
  currentRoom,
  myPlayerId,
  myPlayerName,
  myPlayer,
  isHost,
  isSecurityTaken,
  errorMessage,
  isLoading,
  setRoom,
  setError,
  clearError,
} from '../state/client-state'

const styles = {
  container: {
    maxWidth: '480px',
    margin: '60px auto',
    padding: '0 16px',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '32px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    textAlign: 'center' as const,
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: '#888',
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#0f0f0f',
    border: '1px solid #444',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '1rem',
    marginBottom: '12px',
    outline: 'none',
  },
  btn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
    transition: 'opacity 0.15s',
  },
  btnPrimary: {
    background: '#e63946',
    color: '#fff',
  },
  btnSecondary: {
    background: '#2a2a2a',
    color: '#e0e0e0',
    border: '1px solid #444',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  error: {
    background: '#3a1a1a',
    border: '1px solid #e63946',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#e63946',
    marginBottom: '16px',
    fontSize: '0.9rem',
  },
  playerList: {
    listStyle: 'none',
    marginTop: '16px',
  },
  playerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: '1px solid #2a2a2a',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  roleSecurity: { background: '#1a3a5c', color: '#60a5fa' },
  roleThief: { background: '#2a1a3a', color: '#c084fc' },
  roleUnassigned: { background: '#2a2a2a', color: '#888' },
  readyBadge: { background: '#1a3a2a', color: '#4ade80' },
}

export function Lobby() {
  const [playerName, setPlayerName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [view, setView] = useState<'home' | 'in-room'>('home')

  const room = currentRoom.value
  const playerId = myPlayerId.value
  const me = myPlayer.value
  const error = errorMessage.value
  const loading = isLoading.value

  // Subscribe to WebSocket messages
  useEffect(() => {
    connection.connect()

    const unsub = connection.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created':
          myPlayerId.value = msg.playerId
          currentRoom.value = null // wait for room_state
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
    if (!playerName.trim()) {
      setError('Enter your name first.')
      return
    }
    myPlayerName.value = playerName.trim()
    isLoading.value = true
    clearError()
    connection.send({ type: 'create_room', playerName: playerName.trim() })
  }

  function handleJoinRoom() {
    if (!playerName.trim()) {
      setError('Enter your name first.')
      return
    }
    if (joinCode.trim().length !== 6) {
      setError('Room code must be 6 characters.')
      return
    }
    myPlayerName.value = playerName.trim()
    isLoading.value = true
    clearError()
    connection.send({
      type: 'join_room',
      roomId: joinCode.trim().toUpperCase(),
      playerName: playerName.trim(),
    })
  }

  function handleSelectRole(role: PlayerRole) {
    clearError()
    connection.send({ type: 'select_role', role })
  }

  function handleToggleReady() {
    clearError()
    connection.send({ type: 'set_ready', ready: !(me?.ready ?? false) })
  }

  if (view === 'in-room' && room) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#888', fontSize: '0.85rem' }}>ROOM CODE</span>
            <span style={{ color: '#888', fontSize: '0.85rem' }}>
              {room.players.length}/5 players
            </span>
          </div>
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              letterSpacing: '0.3em',
              textAlign: 'center',
              marginBottom: '24px',
              fontFamily: 'monospace',
            }}
          >
            {room.id}
          </div>

          {error && (
            <div style={styles.error}>
              {error}
              <button
                onClick={clearError}
                style={{
                  float: 'right',
                  background: 'none',
                  border: 'none',
                  color: '#e63946',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Role Selection */}
          {!me?.ready && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '10px' }}>
                SELECT ROLE
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  style={{
                    ...styles.btn,
                    ...styles.btnSecondary,
                    flex: 1,
                    ...(me?.role === 'security' ? { border: '1px solid #60a5fa', color: '#60a5fa' } : {}),
                    ...(isSecurityTaken.value && me?.role !== 'security' ? styles.btnDisabled : {}),
                  }}
                  onClick={() => !isSecurityTaken.value || me?.role === 'security'
                    ? handleSelectRole('security')
                    : undefined}
                  disabled={isSecurityTaken.value && me?.role !== 'security'}
                >
                  Security {isSecurityTaken.value && me?.role !== 'security' ? '(taken)' : ''}
                </button>
                <button
                  style={{
                    ...styles.btn,
                    ...styles.btnSecondary,
                    flex: 1,
                    ...(me?.role === 'thief' ? { border: '1px solid #c084fc', color: '#c084fc' } : {}),
                  }}
                  onClick={() => handleSelectRole('thief')}
                >
                  Thief
                </button>
              </div>
            </div>
          )}

          {/* Ready Button */}
          <button
            style={{
              ...styles.btn,
              ...(me?.ready ? styles.btnSecondary : styles.btnPrimary),
              marginBottom: '20px',
              ...(me?.role === 'unassigned' ? styles.btnDisabled : {}),
            }}
            onClick={handleToggleReady}
            disabled={me?.role === 'unassigned'}
          >
            {me?.ready ? 'Not Ready' : 'Ready Up'}
          </button>

          {/* Players List */}
          <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>PLAYERS</p>
          <ul style={styles.playerList}>
            {room.players.map((player: PlayerInfo) => (
              <li key={player.id} style={styles.playerItem}>
                <span style={{ flex: 1 }}>
                  {player.name}
                  {player.id === room.hostId && (
                    <span style={{ color: '#888', fontSize: '0.75rem', marginLeft: '6px' }}>
                      (host)
                    </span>
                  )}
                  {player.id === myPlayerId.value && (
                    <span style={{ color: '#888', fontSize: '0.75rem', marginLeft: '6px' }}>
                      (you)
                    </span>
                  )}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    ...(player.role === 'security'
                      ? styles.roleSecurity
                      : player.role === 'thief'
                      ? styles.roleThief
                      : styles.roleUnassigned),
                  }}
                >
                  {player.role}
                </span>
                {player.ready && (
                  <span style={{ ...styles.badge, ...styles.readyBadge }}>ready</span>
                )}
                {!player.connected && (
                  <span style={{ ...styles.badge, background: '#3a2a1a', color: '#fb923c' }}>
                    disconnected
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (view === 'in-room' && !room) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ textAlign: 'center', color: '#888' }}>Waiting for room data…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>HEIST</h1>
        <p style={styles.subtitle}>A 1v4 asymmetric multiplayer game</p>

        {error && (
          <div style={styles.error}>
            {error}
            <button
              onClick={clearError}
              style={{
                float: 'right',
                background: 'none',
                border: 'none',
                color: '#e63946',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}

        <input
          style={styles.input}
          type="text"
          placeholder="Your name"
          value={playerName}
          onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)}
          maxLength={24}
        />

        <button
          style={{
            ...styles.btn,
            ...styles.btnPrimary,
            marginBottom: '12px',
            ...(loading ? styles.btnDisabled : {}),
          }}
          onClick={handleCreateRoom}
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create Room'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0 12px' }}>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #333' }} />
          <span style={{ color: '#555', fontSize: '0.85rem' }}>or join</span>
          <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #333' }} />
        </div>

        <input
          style={{ ...styles.input, fontFamily: 'monospace', letterSpacing: '0.2em' }}
          type="text"
          placeholder="ROOM CODE"
          value={joinCode}
          onInput={(e) => setJoinCode((e.target as HTMLInputElement).value.toUpperCase())}
          maxLength={6}
        />

        <button
          style={{
            ...styles.btn,
            ...styles.btnSecondary,
            ...(loading ? styles.btnDisabled : {}),
          }}
          onClick={handleJoinRoom}
          disabled={loading}
        >
          {loading ? 'Joining…' : 'Join Room'}
        </button>
      </div>
    </div>
  )
}
