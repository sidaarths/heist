export const TICK_RATE = 20 // ticks per second
export const TICK_MS = 1000 / TICK_RATE // 50ms
export const HEIST_DURATION_TICKS = 6000 // 5 min × 20 tps
export const ALARM_LOCKDOWN_TICKS = 1200 // 60s — timer cap when alarm triggers

// Player
export const VIEWPORT_RADIUS = 200 // pixels
export const VIEWPORT_RADIUS_DIMMED = 100 // when lights cut
export const BASE_MOVE_SPEED = 0.25 // tiles per tick (~8 px/tick at TILE_SIZE=32)
export const LOOT_SPEED_PENALTY = 0.7 // multiplier per loot item

// Thief interaction durations (in ticks)
export const PICK_LOCK_TICKS = 80  // 4 seconds @ 20tps
export const DESTROY_CAMERA_TICKS = 100 // 5 seconds
export const DISABLE_ALARM_TICKS = 100 // 5 seconds
export const FREEZE_DURATION_TICKS = 100 // 5 seconds

// Security cooldowns (in ticks)
export const COOLDOWN_LOCK_DOOR_TICKS = 60 // 3 seconds
export const COOLDOWN_CUT_LIGHTS_TICKS = 600 // 30 seconds
export const CUT_LIGHTS_DURATION_TICKS = 300 // 15 seconds

// Game balance
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 5
export const LOOT_COUNT_MIN = 3
export const LOOT_COUNT_MAX = 5
export const MAX_LOOT_CARRY = 3 // max loot a thief can carry (same as LOOT_TO_WIN — no hoarding)
export const AUTO_PICKUP_RADIUS = 0.8 // tiles — loot is auto-collected within this range
export const MAX_GUARDS_PER_ROOM = 5
export const MAX_PATROL_WAYPOINTS = 20
export const COOLDOWN_RELEASE_GUARD_TICKS = 300 // 15s — one guard per 15s
export const TARGET_ID_MAX_LEN = 64 // max length for any targetId field
/** Thief vision radius in tiles (for fog of war). */
export const THIEF_VISION_TILES = 5
export const ALARM_PANEL_COUNT_MIN = 4
export const ALARM_PANEL_COUNT_MAX = 6
export const LOOT_TO_WIN = 3 // minimum loot to escape with
export const CUT_LIGHTS_MAX_USES = 3 // security can cut lights this many times per game

// Chat
export const CHAT_MESSAGE_MAX_LEN = 200

// Replay
export const REPLAY_BUFFER_MAX = 6_000 // 5 min @ 20 tps

// Room
export const ROOM_CODE_LENGTH = 6
export const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000 // 5 minutes after game ends
export const MAX_ROOMS = 50
