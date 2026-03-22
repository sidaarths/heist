import { useEffect } from 'preact/hooks'
import type { ServerMessage, PlayerInfo } from '@heist/shared'
import { connection } from './net/connection'
import {
  currentRoom, myPlayerId,
  currentGameState, planningSecondsRemaining, addChatMessage,
  setRoom, setError, clearError,
} from './state/client-state'
import { Lobby } from './screens/Lobby'
import { Planning } from './screens/Planning'

export function App() {
  const room = currentRoom.value
  const phase = room?.phase ?? null

  useEffect(() => {
    connection.connect()

    const unsub = connection.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created':
          myPlayerId.value = msg.playerId
          currentRoom.value = null
          clearError()
          break
        case 'room_joined':
          myPlayerId.value = msg.playerId
          clearError()
          break
        case 'room_state':
          setRoom(msg.room)
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
        case 'game_start':
          currentGameState.value = msg.gameState
          if (currentRoom.value) {
            currentRoom.value = { ...currentRoom.value, phase: 'heist' }
          }
          break
        case 'game_state_tick':
          currentGameState.value = msg.gameState
          break
        case 'planning_tick':
          planningSecondsRemaining.value = msg.secondsRemaining
          break
        case 'chat_message':
          addChatMessage(msg.fromName, msg.message)
          break
        case 'error':
          setError(msg.message)
          break
      }
    })

    return unsub
  }, [])

  if (phase === 'planning') {
    return <Planning />
  }

  // lobby, null, and future phases all fall through to Lobby for now
  return <Lobby />
}
