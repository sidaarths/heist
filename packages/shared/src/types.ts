export type GamePhase = 'lobby' | 'planning' | 'heist' | 'resolution' | 'replay'
export type PlayerRole = 'security' | 'thief' | 'unassigned'

export interface PlayerInfo {
  id: string
  name: string
  role: PlayerRole
  ready: boolean
  connected: boolean
}

export interface GameRoom {
  id: string          // 6-char alphanumeric code
  phase: GamePhase
  players: PlayerInfo[]
  hostId: string      // Security player ID (or first player)
  createdAt: number
}

export interface LootItem {
  id: string
  x: number
  y: number
  value: number
  weight: number
  carried: boolean
  carriedBy: string | null
}

export interface Door {
  id: string
  x: number
  y: number
  locked: boolean
  open: boolean
}

export interface Camera {
  id: string
  x: number
  y: number
  angle: number
  fov: number
  destroyed: boolean
}

export interface AlarmPanel {
  id: string
  x: number
  y: number
  disabled: boolean
  triggered: boolean
}

export interface Guard {
  id: string
  x: number
  y: number
  patrolPath: Array<{ x: number; y: number }>
  patrolIndex: number
  alerted: boolean
}

export interface PlayerPosition {
  playerId: string
  x: number
  y: number
  frozen: boolean
  frozenTicksRemaining: number
  lootCarried: string[]
}

export interface ExitPoint {
  x: number
  y: number
}

export interface GameState {
  room: GameRoom
  /** Which map is loaded — used by clients to look up the MapDef. */
  mapId: string
  loot: LootItem[]
  doors: Door[]
  cameras: Camera[]
  alarmPanels: AlarmPanel[]
  guards: Guard[]
  playerPositions: PlayerPosition[]
  exit: ExitPoint
  tick: number
  alarmTriggered: boolean
  /** Global heist countdown (ticks). Security wins when this hits 0. */
  heistTicksRemaining: number
  /** Saved timer value before alarm reduced it — restored when alarm is disabled. */
  preAlarmTicksRemaining: number | null
  lightsOut: boolean
  lightsOutRemainingTicks: number
  /** How many times security can still cut the lights (counts down from CUT_LIGHTS_MAX_USES). */
  cutLightsUsesRemaining: number
}
