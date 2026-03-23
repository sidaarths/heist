# Heist — Multiplayer Asymmetric Party Game
## Full Design & Implementation Plan

---

## Concept

A real-time multiplayer browser game for 3–5 players with asymmetric roles. One player is the **Security AI** with god-mode control of a building. The rest are **Thieves** trying to steal loot and escape. Every player sees a completely different interface rendered from the same shared game state.

---

## Roles

### Security AI (1 player)
- Sees the entire building from a top-down overhead view
- Controls building systems using a cooldown-based toolkit
- Cannot directly touch or move thieves
- **Wins by:** letting the 5-minute heist timer reach zero

### Thieves (2–4 players)
- Each has a small viewport showing only the area around their character
- Can see other thieves only if they're within their viewport range
- Coordinate exclusively through in-game text chat (no voice, no shared map)
- **Wins by:** collecting the required number of loot items and getting at least one thief to the exit with loot before time runs out

---

## Toolkits

### Security Toolkit (all have cooldowns)
| Action | Cooldown | Description |
|--------|----------|-------------|
| Cameras | Always-on | Full vision across map; triggers alarm automatically when thief enters FOV cone; thieves can destroy by standing next to one for 5s |
| Lock/Unlock Door | 3s | Seals corridors/rooms; thieves can pick locks (4s, visible to cameras) |
| Trigger Alarm | One-time | Caps heist timer to 60s (if over 60s remaining); cannot trigger if under 60s |
| Cut Lights | 30s | Shrinks thief viewports in a zone for 15s |
| Release Guard | 15s | Security draws patrol path (max 20 waypoints); thieves who walk into guard are frozen for `FREEZE_DURATION_TICKS`; max 5 active guards per room |

### Thief Toolkit
| Action | Duration | Notes |
|--------|----------|-------|
| Move | — | Navigate within viewport |
| Pick Lock | 4s | Visible to cameras while picking |
| Destroy Camera | 5s | Must stand adjacent, uninterrupted; disables FOV auto-alarm |
| Disable Alarm Panel | 5s | Cancels active alarm; restores heist timer to pre-alarm value |
| Carry Loot | — | Slows movement (×0.7 per item); can drop to run |
| Text Chat | — | Available during heist; only thieves can read; Security cannot see it |

---

## Map

- Top-down 2D building with multiple wings, corridors, and rooms
- **Loot items:** 3–5, placed randomly each game
- **Alarm panels:** 4–6, placed randomly each game
- **Exit point:** single, randomized position each game (unknown to thieves at start)
- **Cameras:** positions fixed per map layout; coverage angles randomized; auto-trigger alarm on thief detection
- **Doors:** lockable/unlockable by Security

---

## Game Flow

```
Lobby → Heist (5min) → Resolution → Replay
```

| Phase | Duration | Description |
|-------|----------|-------------|
| **Lobby** | — | Players join via room code; roles assigned; all ready up |
| **Heist** | 5min | Live gameplay; all mechanics active; thieves can chat |
| **Resolution** | — | Game ends; winner announced |
| **Replay** | — | Full overhead ghost replay of entire heist from Security POV |

### Win Conditions
- **Thieves win:** ≥1 thief reaches the exit carrying loot (≥3 loot total escaped)
- **Security wins:** Heist timer (`heistTicksRemaining`) reaches zero

### Alarm Mechanics
- Security can trigger the alarm **once** (if `heistTicksRemaining > ALARM_LOCKDOWN_TICKS`)
- Alarm caps the heist timer to `ALARM_LOCKDOWN_TICKS = 1200` (60s); saves old value to `preAlarmTicksRemaining`
- If timer is already ≤60s, alarm button is disabled
- Thieves can disable the alarm via an alarm panel (5s interaction); restores timer to `preAlarmTicksRemaining − elapsed_lockdown_ticks` (so time already spent in lockdown is not recovered)
- Cameras auto-trigger the alarm when a thief enters their FOV cone (2.5-tile range); same timer-cap logic applies

---

## Aesthetic & Visual Design

### Vibe
Fast, chaotic, and social. Games should last 5–8 minutes total. The experience should feel like you're inside a heist movie — thieves frantically whispering plans in chat while Security is methodically closing off escape routes. The post-game replay is the punchline: thieves finally see how close Security was, or how badly Security misread their plan.

### Visual Identity: Retro Terminal / CRT Hacker
The entire UI is styled as a glitching, retro terminal interface. Every screen should feel like you're operating a system that barely holds together under pressure.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Background | `#0a0a0f` near-black with slight blue tint | Deep space / dead monitor |
| Primary text | `#c8ffc8` phosphor green | Classic CRT terminal |
| Accent / danger | `#ff4444` red pulse | Alarm states, lockdown |
| Accent / safe | `#44ff44` bright green pulse | Ready, success states |
| Scanlines | `repeating-linear-gradient` overlay on `body::after` | Authentic CRT texture |
| Title font | **Press Start 2P** (Google Fonts) | 8-bit pixel aesthetic |
| Body font | **VT323** (Google Fonts) | Monospace terminal readout |

### Animations
| Animation | Usage | Description |
|-----------|-------|-------------|
| `glitch` | Title "HEIST" | Horizontal translate + hue-rotate flicker, random skew |
| `blink` | Cursor, status text | 1s step-end infinite on `opacity` |
| `fadeUp` | Panels, forms | Slide up 20px + fade in on mount |
| `redPulse` | Room code display | box-shadow pulses red-to-transparent |
| `greenPulse` | Ready indicator | box-shadow pulses green-to-transparent |
| `rowIn` | Player list rows | Stagger slide-in left per row |
| `joinExpand` | Join code panel | max-height expand from 0 |

### UI Components
| Component | Style |
|-----------|-------|
| Buttons `.pbtn` | 2px solid green border, `::after` pseudo-element creates 3px pixel shadow; shifts on `:active` |
| Inputs `.pinput` | Green border, dark bg, phosphor green text, blink cursor |
| Room code `.rcode` | Red pulsing border, uppercase monospace, `role="button"` click-to-copy |
| Player rows `.prow` | Full-width with role badge coloured by role, staggered row-in animation |
| Error messages | Red `#ff4444`, blink animation |
| Loading / status | Blink animation on ellipsis or status text |

### Screen-by-Screen Aesthetic Goals
- **Lobby:** Terminal boot sequence feel. Title glitches on loop. Two primary actions (HOST / JOIN) as large pixel buttons. Join code panel expands inline rather than navigating away.
- **Heist (Thief):** Dark canvas. Only lit circle around player. Chat sidebar on the right. Interaction prompts appear as terminal pop-ups. Progress bars styled as ASCII fill.
- **Heist (Security):** Full map canvas. Red camera FOV wedges. Toolbar at bottom with cooldown bars as pixel progress. Alarm trigger button pulses red when alarm is active.
- **Resolution:** Full-screen winner announcement. "MISSION ACCOMPLISHED" (green) or "ACCESS DENIED — LOCKDOWN COMPLETE" (red). Pixel confetti or glitch effect.
- **Replay:** Overhead map, ghost trails per player in distinct colours, event callout labels pop in terminal-style boxes.

### Sound (Future)
- Chiptune / lo-fi beeps for interactions
- Low alarm buzz when lockdown triggered
- Door lock clunk sound effect
- Chat message blip (thieves only)

---

## Key Design Rules

1. Security has power but limited actions per cooldown — cannot lock every door at once, must prioritize
2. Thieves are individually weak but collectively strong — coordination through chat is the core skill
3. No thief has a global map at any point during the heist phase
4. Security cannot read thief chat
5. Exit location is unknown to thieves at game start — they must explore or communicate
6. Loot slows thieves — risk/reward decision on how much to carry
7. All randomization (loot, panels, exit) happens fresh each game
8. No planning phase — game starts immediately after LAUNCH HEIST

---

## Technical Architecture

### Stack
- **Server:** Bun + WebSocket (`server.publish` pub/sub), single-process, in-memory state
- **Client:** Preact + `@preact/signals`, Canvas 2D rendering
- **Shared:** TypeScript types + constants package
- **Transport:** JSON over WebSocket; game ticks broadcast at 20 tps

### Tick Loop (Server)
```
every 50ms:
  advance game state (move guards, tick freeze/cooldowns/interactions, camera detection, heist timer, win conditions)
  for each player in room:
    send filtered game_state_tick (thieves see only nearby positions; security sees full state)
  append snapshot to replay buffer
```

### Message Flow
```
Client → Server: player_move, player_action, security_action, chat
Server → Client: game_state_tick (20/s), game_start, game_over, chat_message
```

### Rendering (Client)
- **Security view:** full map canvas, all entities visible, action toolbar, heist timer
- **Thief view:** clipped canvas centred on player (fog-of-war outside), chat sidebar, heist timer
- **Replay view:** full map canvas, ghost paths animated at recorded speed

---

## Phases

---

## ✅ Phase 1 — Lobby (COMPLETE)

**Branch:** `phase-1`  **PR:** #1 (merged)

### Delivered
- [x] Bun WebSocket server with room management
- [x] Room creation & join via 6-char code
- [x] Role selection (Security / Thief)
- [x] Ready-up system; host clicks LAUNCH HEIST after all players ready with valid role composition
- [x] Real-time player list sync via `room_state` broadcasts
- [x] CORS origin matching with wildcard patterns for Vercel preview URLs
- [x] Rate limiting (20 msg/s per connection)
- [x] Retro terminal UI (Press Start 2P + VT323, CRT scanlines, glitch animations)
- [x] Fixed UX flow: name → HOST A JOB | JOIN A CREW
- [x] Leave room (ABORT MISSION)
- [x] Click-to-copy room code
- [x] 41 unit tests (socket-handler broadcast isolation, rate limiting)
- [x] 25 Playwright E2E tests (lobby flow, multiplayer sync)
- [x] CI: typecheck + unit tests on every push
- [x] Deployed: Vercel (client) + Fly.io (server)

---

## ✅ Phase 2 — Game Engine Foundation (COMPLETE)

**Branch:** `phase-2`  **PR:** #3 (merged)

### Delivered
- [x] **`start_game` message** — host clicks LAUNCH HEIST; server validates (all ready, ≥2 players, security assigned); transitions room directly to `heist`
- [x] **GameEngine class** — `advanceTick()` heist loop; `replayBuffer` snapshot accumulation
- [x] **Map initializer** — `initGameState(room, map)` — randomly places loot, alarm panels, exit with unique-tile guarantee; assigns spawn points
- [x] **Heist tick loop** — `startGame()` runs `setInterval` at 50ms; broadcasts `game_state_tick`; `game_start` sent immediately
- [x] **Guard patrol AI** — waypoint follower advancing along `patrolPath` with wrap-around
- [x] **Thief chat** — `chat` client message → broadcast `chat_message` to thieves only; Security excluded; available during `heist` phase
- [x] **Phase router (`App.tsx`)** — all WebSocket messages handled centrally; planning phase removed
- [x] **Signal-driven lobby navigation** — `inRoom = myPlayerId.value !== null`; eliminates local view state
- [x] **LAUNCH HEIST button** — host-only; disabled with reason until all conditions met; `data-testid="start-game-btn"`
- [x] **MIN_PLAYERS = 2** — games can start with 1 Security + 1 Thief (supports 2–5 players)
- [x] **168 server unit tests** (game-engine, map-init, movement, interactions, security-actions, win-conditions, session-manager)
- [x] **Playwright E2E tests** — lobby, multiplayer, heist (WASD, security toolbar, lockdown timer, result screen), heist-chat (timer, chat, cross-thief)

---

## ✅ Phase 3 — Heist Phase: Movement & Interactions (COMPLETE)

**Branch:** `phase-3`

### Delivered
- [x] **Movement validation** — `player_move` → check not walking into wall → update `player.x/y`; `dx`/`dy` clamped to `[-1, 1]`
- [x] **Loot speed penalty** — `LOOT_SPEED_PENALTY = 0.7` per item carried; stacks multiplicatively
- [x] **Freeze mechanic** — guard collision freezes thief for `FREEZE_DURATION_TICKS = 100` ticks; auto-unfreezes
- [x] **Interaction system** — `player_action` starts tick-countdown; cancels if player moves; completes on tick expiry
- [x] **Pick lock** — `PICK_LOCK_TICKS = 80` (4s); door.locked = false on complete
- [x] **Destroy camera** — `DESTROY_CAMERA_TICKS = 100` (5s); camera.destroyed = true
- [x] **Disable alarm** — `DISABLE_ALARM_TICKS = 100` (5s); cancels alarm; restores `heistTicksRemaining` from `preAlarmTicksRemaining`
- [x] **Take / drop loot** — instant; loot.carriedBy = playerId; drop places loot at player position
- [x] **Camera FOV detection** — active cameras auto-trigger alarm when thief within 2.5-tile range + inside FOV cone (angle check using `atan2`); destroyed cameras skip detection
- [x] **Security actions** — lock/unlock door (cooldown), trigger alarm (one-time, disabled if timer ≤60s), cut lights (zone, 30s cooldown, 15s duration), release guard (15s cooldown, max 5 guards, max 20 waypoints per path)
- [x] **Heist timer** — `heistTicksRemaining` counts down every tick; Security wins at 0; displayed as MM:SS in HUD
- [x] **Alarm timer cap** — `trigger_alarm` sets `heistTicksRemaining = ALARM_LOCKDOWN_TICKS` (1200 ticks, 60s) if currently over 60s; saves old value to `preAlarmTicksRemaining`; disable restores minus elapsed lockdown ticks
- [x] **Win condition checks** — thieves win when thief at exit carrying loot + total escaped ≥ `LOOT_TO_WIN`; security wins when `heistTicksRemaining == 0`; `game_over` broadcast; `preAlarmTicksRemaining` cleared before broadcast
- [x] **Proximity check** — Euclidean distance check; player must be within `INTERACTION_START_RANGE = 2.0` tiles of target
- [x] **Frozen interaction cancel** — active interactions (pick lock, destroy camera, disable alarm) are cancelled immediately if the player becomes frozen mid-progress
- [x] **Tick interval cleanup** — `game_over` triggers `onGameOver` callback; `GameSessionManager` clears the `setInterval` so no stale ticks leak after game ends
- [x] **Per-player fog-of-war broadcast** — `game_state_tick` is sent individually per player; thieves only receive positions of players within `THIEF_VISION_TILES`; security receives full state
- [x] **WASD key movement** — emit `player_move` on keydown; canvas must have focus
- [x] **Interaction prompts** — show "[E] Pick Lock", "[E] Take Loot" etc. when near interactable
- [x] **Progress bars** — pick-lock / destroy-camera / disable-alarm progress arc
- [x] **Security toolbar** — cooldown buttons: Lock Door, Cut Lights, Trigger Alarm, Release Guard; `data-testid` on each
- [x] **Thief FOV clip** — fog-of-war via offscreen canvas `destination-out` compositing; `THIEF_VISION_TILES = 5`; dimmed during lights-out
- [x] **Camera cone rendering** — Security view shows FOV wedges; red if thief inside cone
- [x] **Lockdown banner** — countdown banner when alarm active; `data-testid="lockdown-banner"` + `data-testid="lockdown-timer"`
- [x] **Result screen** — full-screen winner; `data-testid="result-screen"`, `data-testid="result-winner"`, `data-testid="play-again-btn"`
- [x] **Play Again** — `reset_room` (lobby/resolution only); stops active session, unreadies all players, returns to lobby
- [x] **Role HUD label** — `data-testid="hud-role"` shows SECURITY / THIEF
- [x] **Lights-out mechanic** — `lightsOut` flag reduces thief vision radius; timer ticks down and restores

---

## 🔲 Phase 4 — Resolution & Replay

**Branch:** `phase-4`

### Goal
Show a clean win/lose screen. Then play back the full heist as an animated overhead replay that reveals everything to the thieves — the punchline of every game.

### Server Tasks
- [ ] **Replay buffer** — server accumulates `GameState[]` snapshots during heist at tick rate
- [ ] **`game_over` payload** — includes winner, reason, final stats (loot escaped, thieves trapped, time elapsed)
- [ ] **Replay delivery** — on request or auto-send compressed replay buffer to all clients after resolution screen

### Client Tasks
- [ ] **"Watch Replay" button** — transitions to replay view
- [ ] **Replay playback** — overhead canvas renders recorded `GameState[]` snapshots; scrubber bar; play/pause; 1× / 2× speed
- [ ] **Ghost paths** — draw translucent path lines behind each player as replay advances
- [ ] **Event callouts** — pop small labels at key moments ("DOOR LOCKED", "CAMERA DESTROYED", "ALARM TRIGGERED")

### TDD — Tests to Write First
```typescript
// server: replay.test.ts
- replay buffer length equals number of ticks elapsed
- each snapshot is a deep copy (not reference)
- replay payload includes all players, loot, door states

// e2e: resolution.spec.ts
- "Watch Replay" button transitions to replay view
- replay playback advances through snapshots
```

---

## Constants Reference

```typescript
TICK_RATE                    = 20        // ticks/sec
TICK_MS                      = 50        // ms/tick
HEIST_DURATION_TICKS         = 6000      // 5 min × 20 tps
ALARM_LOCKDOWN_TICKS         = 1200      // 60s × 20 tps — timer cap when alarm triggers
TILE                         = 32        // px per tile
THIEF_VISION_TILES           = 5         // tiles visible around thief (fog-of-war + server filter)
BASE_MOVE_SPEED              = 0.25      // tiles per tick (~8 px/tick at TILE_SIZE=32)
LOOT_SPEED_PENALTY           = 0.7       // multiplier per loot item carried (stacks multiplicatively)
PICK_LOCK_TICKS              = 80        // 4s @ 20tps
DESTROY_CAMERA_TICKS         = 100       // 5s
DISABLE_ALARM_TICKS          = 100       // 5s
FREEZE_DURATION_TICKS        = 100       // 5s — guard collision freeze; auto-cancels interaction
INTERACTION_START_RANGE      = 2.0       // tiles (Euclidean) — max range to begin an interaction
INTERACTION_CANCEL_RADIUS    = 2.5       // tiles (Euclidean) — moving further cancels in-progress interaction
CAMERA_FOV_DETECTION_RANGE   = 2.5       // tiles — radius for camera auto-alarm trigger
COOLDOWN_LOCK_DOOR_TICKS     = 60        // 3s
COOLDOWN_CUT_LIGHTS_TICKS    = 600       // 30s
CUT_LIGHTS_DURATION_TICKS    = 300       // 15s
COOLDOWN_RELEASE_GUARD_TICKS = 300       // 15s — per-guard cooldown
MAX_GUARDS_PER_ROOM          = 5         // hard cap on simultaneous active guards
MAX_PATROL_WAYPOINTS         = 20        // max waypoints per patrol path (server-enforced)
TARGET_ID_MAX_LEN            = 64        // max length of any targetId field (server-enforced)
MIN_PLAYERS                  = 2
MAX_PLAYERS                  = 5         // 1 Security + up to 4 Thieves
MAX_CONNECTIONS_PER_IP       = 5         // WebSocket connection cap per IP address
MAX_MESSAGES_PER_IP_PER_SEC  = 100       // IP-level message rate cap (closes connection on violation)
CHAT_MESSAGE_MAX_LEN         = 200       // enforced server-side + maxLength on client input
REPLAY_BUFFER_MAX            = 6_000     // max snapshots retained (~5 min @ 20tps)
LOOT_COUNT_MIN               = 3
LOOT_COUNT_MAX               = 5
ALARM_PANEL_COUNT_MIN        = 4
ALARM_PANEL_COUNT_MAX        = 6
LOOT_TO_WIN                  = 3
```

---

## Security Notes

### Fixed
- Ghost player DoS: `ALREADY_IN_ROOM` guard prevents a player joining a second room without leaving the first
- Chat phase gate: `handleChat` rejects with `WRONG_PHASE` outside `heist`
- Lobby-only mutations: `selectRole` and `setReady` reject when `room.phase !== 'lobby'`
- Client memory: `chatMessages` capped at 200 entries; oldest dropped on overflow
- Input validation: player name trimmed before length check; raw `roomId` no longer echoed in join errors
- Room code generation: iterative loop with 10-attempt cap (no unbounded recursion)
- `player_move` `dx`/`dy` clamped to `[-1, 1]` server-side
- Proximity validation: Euclidean distance check (`INTERACTION_START_RANGE = 2.0` tiles); cancels if player moves beyond `INTERACTION_CANCEL_RADIUS = 2.5` tiles
- Frozen interaction cancel: interactions are wiped immediately when player becomes frozen mid-progress
- Alarm timer restore: `disable_alarm` restores `preAlarmTicksRemaining − elapsed_lockdown_ticks`, not the full saved value
- Tick loop cleanup: `onGameOver` callback clears `setInterval` on game end; no stale ticks after `game_over`
- `preAlarmTicksRemaining` cleared to `null` before `game_over` is broadcast
- `reset_room` restricted to `lobby` and `resolution` phases; calls `stopRoom` to clear any active tick loop before mutating state
- Per-player fog-of-war: `game_state_tick` is individually filtered per player; thieves only receive `playerPositions` within `THIEF_VISION_TILES`
- IP-level rate limiting: `MAX_MESSAGES_PER_IP_PER_SEC = 100` closes connection on violation; `MAX_CONNECTIONS_PER_IP = 5` rejects new connections
- Guard spawn cap: `MAX_GUARDS_PER_ROOM = 5`; `release_guard` has `COOLDOWN_RELEASE_GUARD_TICKS = 300` cooldown
- Patrol path cap: `patrolPath` sliced to `MAX_PATROL_WAYPOINTS = 20` before bounds validation
- `targetId` length capped to `TARGET_ID_MAX_LEN = 64` in `player_action` and `security_action`
- `lootCarried` capped at `LOOT_COUNT_MAX` items per player
- Wildcard origin matching fixed: `*.example.com` now requires a single non-empty subdomain label (no dots); prevents subdomain-bypass and lookalike domains

### Deferred
- **Stale room TTL** — `ROOM_CLEANUP_DELAY_MS` constant exists but sweep not implemented; add periodic cleanup job
- **Security headers** — add `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` via Hono middleware

---

## File Structure (Current)

```
packages/
├── shared/src/
│   ├── types.ts          ✅ (GameState, LootItem, Door, Camera, Guard…)
│   ├── messages.ts       ✅
│   ├── constants.ts      ✅
│   └── map-defs.ts       ✅ (BASIC_MAP)
│
├── server/src/
│   ├── index.ts          ✅
│   ├── lobby.ts          ✅ (RoomManager)
│   ├── net/
│   │   ├── socket-handler.ts   ✅
│   │   └── message-router.ts   ✅
│   └── game/
│       ├── game-engine.ts      ✅ tick loop, guard AI, camera detection, heist timer
│       ├── map-init.ts         ✅ random placement
│       ├── session-manager.ts  ✅ startGame() — immediate heist, no planning phase
│       ├── movement.ts         ✅ wall collision, loot penalty, freeze
│       ├── interactions.ts     ✅ pick_lock, destroy_camera, disable_alarm, take/drop loot
│       ├── security-actions.ts ✅ lock_door, trigger_alarm, cut_lights, release_guard
│       └── win-conditions.ts   ✅ timer=0 → security win; exit+loot → thief win
│   └── __tests__/
│       ├── socket-handler.test.ts   ✅
│       ├── lobby.test.ts            ✅
│       ├── game-engine.test.ts      ✅
│       ├── map-init.test.ts         ✅
│       ├── session-manager.test.ts  ✅
│       ├── movement.test.ts         ✅
│       ├── interactions.test.ts     ✅
│       ├── security-actions.test.ts ✅
│       ├── win-conditions.test.ts   ✅
│       └── replay.test.ts           🔲 Phase 4
│
└── client/src/
    ├── main.tsx          ✅
    ├── state/
    │   └── client-state.ts  ✅
    ├── net/
    │   └── connection.ts    ✅
    ├── screens/
    │   ├── Lobby.tsx        ✅
    │   ├── Heist.tsx        ✅ (canvas, fog-of-war, chat sidebar, HUD, security toolbar)
    │   ├── Resolution.tsx   🔲 Phase 4
    │   └── Replay.tsx       🔲 Phase 4
    ├── canvas/
    │   ├── MapRenderer.ts   ✅
    │   ├── EntityLayer.ts   ✅ (players, loot, cameras, guards, FOV cones)
    │   └── FogOfWar.ts      ✅
    └── tests/e2e/
        ├── lobby.spec.ts        ✅
        ├── multiplayer.spec.ts  ✅
        ├── planning.spec.ts     ✅ (rewritten as heist-chat tests)
        ├── heist.spec.ts        ✅
        └── resolution.spec.ts   🔲 Phase 4
```

---

## Vibe

Fast, chaotic, and social. Games should last 5–8 minutes total. The experience should feel like a heist movie — thieves frantically whispering plans in chat while Security methodically closes off escape routes. The post-game replay is the punchline: thieves finally see how close Security was, or how badly Security misread their plan.
