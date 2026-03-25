import { useEffect } from 'preact/hooks'
import type { ServerMessage, PlayerInfo } from '@heist/shared'
import { connection } from './net/connection'
import {
  currentRoom, myPlayerId,
  currentGameState, addChatMessage,
  setRoom, setError, clearError, handleGameOver, clearGameOver, clearChatMessages,
  setReplayBuffer,
} from './state/client-state'
import { Lobby } from './screens/Lobby'
import { Heist } from './screens/Heist'
import { Result } from './screens/Result'
import { Replay } from './screens/Replay'

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
          // When transitioning back to lobby from resolution, clear game state
          if (msg.room.phase === 'lobby' && currentRoom.value?.phase === 'resolution') {
            currentGameState.value = null
            clearGameOver()
            clearChatMessages()
          }
          setRoom(msg.room)
          break
        case 'player_left':
          if (currentRoom.value) {
            currentRoom.value = {
              ...currentRoom.value,
              players: currentRoom.value.players.filter((p: PlayerInfo) => p.id !== msg.playerId),
            }
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
        case 'game_over':
          handleGameOver(msg.winner, msg.reason, msg.finalStats)
          break
        case 'replay_data':
          if (Array.isArray(msg.buffer)) {
            setReplayBuffer(msg.buffer)
            if (currentRoom.value) {
              currentRoom.value = { ...currentRoom.value, phase: 'replay' }
            }
          }
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

  if (phase === 'heist') {
    return <Heist />
  }

  if (phase === 'resolution') {
    return <Result />
  }

  if (phase === 'replay') {
    return <Replay />
  }

  // lobby, null, and future phases all fall through to Lobby
  return <Lobby />
}
