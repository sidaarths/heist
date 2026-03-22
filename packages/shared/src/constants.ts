export const TICK_RATE = 20 // ticks per second
export const TICK_MS = 1000 / TICK_RATE // 50ms
export const HEIST_DURATION_MS = 5 * 60 * 1000 // 5 minutes
export const PLANNING_DURATION_MS = 60 * 1000 // 60 seconds
export const LOCKDOWN_DURATION_MS = 90 * 1000 // 90 seconds

// Player
export const VIEWPORT_RADIUS = 200 // pixels
export const VIEWPORT_RADIUS_DIMMED = 100 // when lights cut
export const BASE_MOVE_SPEED = 3 // pixels per tick
export const LOOT_SPEED_PENALTY = 0.7 // multiplier per loot item

// Thief interaction durations (in ticks)
export const PICK_LOCK_TICKS = 160 // 8 seconds @ 20tps
export const DESTROY_CAMERA_TICKS = 100 // 5 seconds
export const DISABLE_ALARM_TICKS = 100 // 5 seconds
export const FREEZE_DURATION_TICKS = 600 // 30 seconds

// Security cooldowns (in ticks)
export const COOLDOWN_LOCK_DOOR_TICKS = 60 // 3 seconds
export const COOLDOWN_TRIGGER_ALARM_TICKS = 0 // no cooldown (one-time use resets)
export const COOLDOWN_CUT_LIGHTS_TICKS = 600 // 30 seconds
export const CUT_LIGHTS_DURATION_TICKS = 300 // 15 seconds

// Game balance
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 5
export const LOOT_COUNT_MIN = 6
export const LOOT_COUNT_MAX = 10
export const ALARM_PANEL_COUNT_MIN = 4
export const ALARM_PANEL_COUNT_MAX = 6
export const LOOT_TO_WIN = 3 // minimum loot to escape with

// Room
export const ROOM_CODE_LENGTH = 6
export const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000 // 5 minutes after game ends
export const MAX_ROOMS = 50
