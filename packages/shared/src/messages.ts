import type { GamePhase, PlayerInfo, PlayerRole, GameRoom, GameState } from './types'

// Client -> Server messages
export type ClientMessage =
  | { type: 'create_room'; playerName: string }
  | { type: 'join_room'; roomId: string; playerName: string }
  | { type: 'select_role'; role: PlayerRole }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'chat'; message: string }
  | { type: 'start_game' }
  | { type: 'player_move'; dx: number; dy: number }
  | { type: 'player_action'; action: 'pick_lock' | 'destroy_camera' | 'disable_alarm' | 'take_loot' | 'drop_loot'; targetId: string }
  | { type: 'security_action'; action: 'lock_door' | 'unlock_door' | 'trigger_alarm' | 'cut_lights' | 'release_guard'; targetId?: string; patrolPath?: Array<{ x: number; y: number }> }
  | { type: 'reset_room' }

// Server -> Client messages
export type ServerMessage =
  | { type: 'room_created'; roomId: string; playerId: string }
  | { type: 'room_joined'; roomId: string; playerId: string; players: PlayerInfo[] }
  | { type: 'player_updated'; player: PlayerInfo }
  | { type: 'player_left'; playerId: string }
  | { type: 'room_state'; room: GameRoom }
  | { type: 'phase_change'; phase: GamePhase }
  | { type: 'error'; code: string; message: string }
  | { type: 'planning_start'; gameState: GameState }
  | { type: 'game_start'; gameState: GameState }
  | { type: 'game_state_tick'; gameState: GameState; tick: number }
  | { type: 'game_over'; winner: 'thieves' | 'security'; reason: string }
  | { type: 'chat_message'; fromId: string; fromName: string; message: string }
  | { type: 'planning_tick'; secondsRemaining: number }
