import type { GamePhase, PlayerInfo, PlayerRole, GameRoom } from './types'

// Client -> Server messages
export type ClientMessage =
  | { type: 'create_room'; playerName: string }
  | { type: 'join_room'; roomId: string; playerName: string }
  | { type: 'select_role'; role: PlayerRole }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'chat'; message: string }

// Server -> Client messages
export type ServerMessage =
  | { type: 'room_created'; roomId: string; playerId: string }
  | { type: 'room_joined'; roomId: string; playerId: string; players: PlayerInfo[] }
  | { type: 'player_updated'; player: PlayerInfo }
  | { type: 'player_left'; playerId: string }
  | { type: 'room_state'; room: GameRoom }
  | { type: 'phase_change'; phase: GamePhase }
  | { type: 'error'; code: string; message: string }
