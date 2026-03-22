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
- **Wins by:** trapping all thieves simultaneously in locked rooms, OR triggering a lockdown and letting the authority countdown hit zero

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
| Cameras | Always-on | Full vision across map; thieves can destroy by standing next to one for 5s |
| Lock/Unlock Door | 3s | Seals corridors/rooms; thieves can pick locks (8s, visible to cameras) |
| Trigger Alarm | One-time reset | Starts lockdown authority-arrival countdown |
| Cut Lights | 30s | Shrinks thief viewports in a zone for 15s |
| Release Guard | Once per game | Security draws patrol path; thieves who walk into guard are frozen 30s |

### Thief Toolkit
| Action | Duration | Notes |
|--------|----------|-------|
| Move | — | Navigate within viewport |
| Pick Lock | 8s | Visible to cameras while picking |
| Destroy Camera | 5s | Must stand adjacent, uninterrupted |
| Disable Alarm Panel | 5s | Cancels active lockdown; panels hidden around map |
| Carry Loot | — | Slows movement (×0.7 per item); can drop to run |
| Text Chat | — | Only thieves can read; Security cannot see it |

---

## Map

- Top-down 2D building with multiple wings, corridors, and rooms
- **Loot items:** 6–10, placed randomly each game
- **Alarm panels:** 4–6, placed randomly each game
- **Exit point:** single, randomized position each game (unknown to thieves at start)
- **Cameras:** positions fixed per map layout; coverage angles randomized
- **Doors:** lockable/unlockable by Security

---

## Game Flow

```
Lobby → Planning (60s) → Heist (5min) → Resolution → Replay
```

| Phase | Duration | Description |
|-------|----------|-------------|
| **Lobby** | — | Players join via room code; roles assigned; all ready up |
| **Planning** | 60s | Thieves see blurred map + can chat; Security studies full map |
| **Heist** | 5min | Live gameplay; all mechanics active |
| **Resolution** | — | Game ends; winner announced |
| **Replay** | — | Full overhead ghost replay of entire heist from Security POV |

### Win Conditions
- **Thieves win:** ≥1 thief reaches the exit carrying loot (≥3 loot total escaped)
- **Security wins:** All thieves simultaneously trapped in locked rooms
- **Security wins:** Lockdown countdown reaches zero

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
- **Planning:** Split screen. Left = blurred/greyed map with scanline overlay. Right = scrolling chat terminal. Countdown timer in large VT323 type, turns red under 10s.
- **Heist (Thief):** Dark canvas. Only lit circle around player. Chat sidebar collapsed by default. Interaction prompts appear as terminal pop-ups. Progress bars styled as ASCII fill.
- **Heist (Security):** Full map canvas. Red camera FOV wedges. Toolbar at bottom with cooldown bars as pixel progress. Alarm trigger button pulses red.
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
  advance game state (move guards, tick interactions, check win conditions)
  broadcast GameStateTick to room topic
  append snapshot to replay buffer
```

### Message Flow
```
Client → Server: player_move, player_action, security_action, chat
Server → Client: game_state_tick (20/s), phase_change, game_over, chat_message
```

### Rendering (Client)
- **Security view:** full map canvas, all entities visible, action toolbar
- **Thief view:** clipped canvas centred on player (VIEWPORT_RADIUS = 200px), fog-of-war outside
- **Planning view:** blurred map overlay, chat sidebar, countdown timer
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

## ✅ Phase 2 — Planning Phase + Game Engine Foundation (COMPLETE)

**Branch:** `phase-2`  **PR:** #3 (open)

### Goal
Host explicitly launches the heist after all players ready up, transitioning from `lobby` → `planning`. Thieves see a blurred map and can chat. Security sees the full map. After 60 seconds, auto-advance to `heist`. Server-side game engine tick loop and canvas map renderer foundation built.

### New Shared Types
```typescript
// messages.ts additions
| { type: 'start_game' }                                        // client → server (host only)
| { type: 'game_start'; gameState: GameState }
| { type: 'game_state_tick'; gameState: GameState; tick: number }
| { type: 'game_over'; winner: 'thieves' | 'security'; reason: string }
| { type: 'chat_message'; fromId: string; fromName: string; message: string }
| { type: 'planning_tick'; secondsRemaining: number }

// client → server
| { type: 'player_move'; dx: number; dy: number }
| { type: 'player_action'; action: 'pick_lock' | 'destroy_camera' | 'disable_alarm' | 'take_loot' | 'drop_loot'; targetId: string }
| { type: 'security_action'; action: 'lock_door' | 'unlock_door' | 'trigger_alarm' | 'cut_lights' | 'release_guard'; targetId?: string; patrolPath?: Array<{x:number;y:number}> }
| { type: 'chat'; message: string }
```

### Delivered
- [x] **`start_game` message** — host clicks LAUNCH HEIST; server validates (all ready, ≥2 players, security assigned, all roles set); transitions room to `planning`
- [x] **GameEngine class** — `advanceTick()` heist loop; `tickPlanningSecond()` planning countdown; `replayBuffer` snapshot accumulation
- [x] **Map initializer** — `initGameState(room, map)` — randomly places loot, alarm panels, exit with unique-tile guarantee; assigns spawn points
- [x] **Planning phase timer** — `GameSessionManager.startPlanning()` runs 1s countdown; broadcasts `planning_tick`; auto-transitions to `startHeist()` at t=0
- [x] **Heist tick loop** — `startHeist()` runs `setInterval` at 50ms; broadcasts `game_state_tick`
- [x] **Guard patrol AI** — waypoint follower advancing along `patrolPath` with wrap-around
- [x] **Thief chat** — `chat` client message → broadcast `chat_message` to thieves only; Security excluded
- [x] **Phase router (`App.tsx`)** — all WebSocket messages handled centrally; `phase === 'planning'` → `<Planning />`
- [x] **Planning screen (`Planning.tsx`)** — split layout: blurred map (thieves) / full map (Security); countdown timer turns red ≤10s; thief chat sidebar
- [x] **Signal-driven lobby navigation** — `inRoom = myPlayerId.value !== null`; eliminates local view state
- [x] **LAUNCH HEIST button** — host-only; disabled with reason until all conditions met; `data-testid="start-game-btn"`
- [x] **MIN_PLAYERS = 2** — games can start with 1 Security + 1 Thief (supports 2–5 players)
- [x] **64 server unit tests** (game-engine, map-init, lobby startGame validation)
- [x] **39 Playwright E2E tests** — lobby (24), multiplayer (6), planning (9; 7 two-player + 2 three-player)
- [x] **Security hardening** — ALREADY_IN_ROOM guard (ghost player DoS), chat locked to planning phase only, `selectRole`/`setReady` blocked after lobby, chatMessages client cap (200), iterative room code generation, MAX_PLAYERS constant in error strings, generic join error (no roomId echo), trim-before-length name validation

---

## 🔲 Phase 3 — Heist Phase: Movement & Interactions

**Branch:** `phase-3`

### Goal
Live heist gameplay. Players move on the canvas. Thieves interact with objects. Security uses their toolkit. Win conditions are detected in real time.

### Server Tasks
- [ ] **Movement validation** — `player_move` → check not walking into wall → update `player.x/y`
- [ ] **Interaction system** — `player_action` starts a tick-countdown on the interaction; cancels if player moves
- [ ] **Loot carry** — `take_loot` attaches loot to player; `drop_loot` detaches; `LOOT_SPEED_PENALTY` applied
- [ ] **Camera detection** — if thief is in camera FOV cone and camera not destroyed → mark visible in game state
- [ ] **Security actions:** lock/unlock door, trigger alarm, cut lights zone, release guard
- [ ] **Lockdown timer** — `LOCKDOWN_DURATION_MS` countdown; broadcasts remaining; triggers Security win at 0
- [ ] **Win condition checks** — run every tick after state advance:
  - Thieves win: thief at exit tile carrying loot + total escaped loot ≥ LOOT_TO_WIN
  - Security win (trap): all thieves in rooms with all doors locked
  - Security win (lockdown): lockdown countdown == 0
- [ ] **Freeze mechanic** — guard collision freezes thief for `FREEZE_DURATION_TICKS`

### Client Tasks
- [ ] **WASD / arrow key movement** — emit `player_move` on keydown/keyup; client-side prediction optional
- [ ] **Interaction prompts** — show "[E] Pick Lock", "[E] Take Loot" etc. when near interactable
- [ ] **Progress bars** — show pick-lock / destroy-camera / disable-alarm progress arc
- [ ] **Security toolbar** — cooldown buttons: Lock Door (click map door), Cut Lights (click zone), Trigger Alarm, Release Guard (draw patrol path)
- [ ] **Thief FOV clip** — render only tiles/entities within VIEWPORT_RADIUS; dimmed to VIEWPORT_RADIUS_DIMMED during lights-out
- [ ] **Camera cone rendering** — Security view shows FOV wedges; red if thief inside cone
- [ ] **Alarm/lockdown overlay** — countdown banner when lockdown active
- [ ] **Guard draw-patrol UI** — Security clicks to place waypoints; confirm sends `release_guard`

### TDD — Tests to Write First
```typescript
// server: movement.test.ts
- player cannot move into wall tile
- player can move to adjacent floor tile
- player position updates correctly for each direction
- loot speed penalty applied when carrying (speed * 0.7)
- frozen player ignores move commands

// server: interactions.test.ts
- pick_lock starts 160-tick countdown on door
- pick_lock cancels if player moves away
- pick_lock completes → door.locked = false
- destroy_camera: 100-tick countdown; camera.destroyed = true on complete
- disable_alarm: cancels active lockdown
- take_loot: loot.carried = true, loot.carriedBy = playerId
- drop_loot: loot.carried = false, loot placed at player position

// server: security-actions.test.ts
- lock_door sets door.locked = true; cooldown applied
- trigger_alarm starts lockdown countdown
- cut_lights sets lightsOut = true; resets after CUT_LIGHTS_DURATION_TICKS
- guard collision freezes thief for FREEZE_DURATION_TICKS

// server: win-conditions.test.ts
- thieves win when thief at exit with loot and total ≥ LOOT_TO_WIN
- security wins when lockdown countdown reaches 0
- security wins when all thieves trapped (all rooms locked, all thieves inside)
- game_over message broadcast on win
```

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
- [ ] **Resolution screen** — full-screen winner announcement (retro style); loot escaped, time remaining, cause of win
- [ ] **"Watch Replay" button** — transitions to replay view
- [ ] **Replay playback** — overhead canvas renders recorded `GameState[]` snapshots; scrubber bar; play/pause; 1× / 2× speed
- [ ] **Ghost paths** — draw translucent path lines behind each player as replay advances
- [ ] **Event callouts** — pop small labels at key moments ("DOOR LOCKED", "CAMERA DESTROYED", "ALARM TRIGGERED")
- [ ] **Play Again / Back to Lobby** — resets room to lobby phase for next game

### TDD — Tests to Write First
```typescript
// server: replay.test.ts
- replay buffer length equals number of ticks elapsed
- each snapshot is a deep copy (not reference)
- replay payload includes all players, loot, door states

// e2e: resolution.spec.ts
- thieves-win screen shows correct winner
- security-win screen shows correct winner
- "Watch Replay" button transitions to replay view
- replay playback advances through snapshots
- "Play Again" resets room to lobby phase
```

---

## Constants Reference

```typescript
TICK_RATE              = 20        // ticks/sec
TICK_MS                = 50        // ms/tick
HEIST_DURATION_MS      = 300_000   // 5 min
PLANNING_DURATION_MS   = 60_000    // 60 sec
LOCKDOWN_DURATION_MS   = 90_000    // 90 sec
VIEWPORT_RADIUS        = 200       // px (normal)
VIEWPORT_RADIUS_DIMMED = 100       // px (lights out)
BASE_MOVE_SPEED        = 3         // px/tick
LOOT_SPEED_PENALTY     = 0.7       // multiplier per loot
PICK_LOCK_TICKS        = 160       // 8s @ 20tps
DESTROY_CAMERA_TICKS   = 100       // 5s
DISABLE_ALARM_TICKS    = 100       // 5s
FREEZE_DURATION_TICKS  = 600       // 30s
COOLDOWN_LOCK_DOOR     = 60        // 3s
COOLDOWN_CUT_LIGHTS    = 600       // 30s
CUT_LIGHTS_DURATION    = 300       // 15s
MIN_PLAYERS            = 2
MAX_PLAYERS            = 5         // 1 Security + up to 4 Thieves
CHAT_MESSAGE_MAX_LEN   = 200       // enforced server-side + maxLength on client input
REPLAY_BUFFER_MAX      = 6_000     // max snapshots retained (~5 min @ 20tps)
LOOT_COUNT_MIN         = 6
LOOT_COUNT_MAX         = 10
ALARM_PANEL_COUNT_MIN  = 4
ALARM_PANEL_COUNT_MAX  = 6
LOOT_TO_WIN            = 3
```

---

## Security Notes

### Fixed (Phase 2)
- Ghost player DoS: `ALREADY_IN_ROOM` guard prevents a player joining a second room without leaving the first
- Chat phase gate: `handleChat` rejects with `WRONG_PHASE` outside `planning`
- Lobby-only mutations: `selectRole` and `setReady` reject when `room.phase !== 'lobby'`
- Client memory: `chatMessages` capped at 200 entries; oldest dropped on overflow
- Input validation: player name trimmed before length check; raw `roomId` no longer echoed in join errors
- Room code generation: iterative loop with 10-attempt cap (no unbounded recursion)

### Deferred
- **IP-level rate limiting** — current per-UUID rate limit resets on reconnect; add IP-based window at upgrade handler
- **Stale room TTL** — `ROOM_CLEANUP_DELAY_MS` constant exists but sweep not implemented; add periodic cleanup job
- **Origin wildcard documentation** — bare `*` in `ALLOWED_ORIGINS` silently allows any origin; needs explicit rejection or doc warning
- **`player_move` bounds** — `dx`/`dy` must be clamped to `[-1, 1]` server-side when Phase 3 is implemented; do not trust raw client values
- **Security headers** — add `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` via Hono middleware

---

## File Structure (Target)

```
packages/
├── shared/src/
│   ├── types.ts          ✅ (GameState, LootItem, Door, Camera, Guard…)
│   ├── messages.ts       ✅ + Phase 2 additions
│   ├── constants.ts      ✅
│   └── map-defs.ts       ✅ (BASIC_MAP)
│
├── server/src/
│   ├── index.ts          ✅
│   ├── lobby.ts          ✅ (RoomManager)
│   ├── net/
│   │   ├── socket-handler.ts   ✅
│   │   └── message-router.ts   ✅
│   ├── game/                   ✅ Phase 2 (partial)
│   │   ├── game-engine.ts      ✅ tick loop, guard AI, replay buffer
│   │   ├── map-init.ts         ✅ random placement
│   │   ├── session-manager.ts  ✅ planning timer, heist tick loop
│   │   ├── movement.ts         🔲 Phase 3
│   │   ├── interactions.ts     🔲 Phase 3
│   │   ├── security-actions.ts 🔲 Phase 3
│   │   ├── win-conditions.ts   🔲 Phase 3
│   │   └── replay-buffer.ts    🔲 Phase 4
│   └── __tests__/
│       ├── socket-handler.test.ts  ✅
│       ├── lobby.test.ts           ✅
│       ├── game-engine.test.ts     ✅
│       ├── map-init.test.ts        ✅
│       ├── movement.test.ts        🔲 Phase 3
│       ├── interactions.test.ts    🔲 Phase 3
│       ├── security-actions.test.ts 🔲 Phase 3
│       ├── win-conditions.test.ts  🔲 Phase 3
│       └── replay.test.ts          🔲 Phase 4
│
└── client/src/
    ├── main.tsx          ✅
    ├── state/
    │   └── client-state.ts  ✅
    ├── net/
    │   └── connection.ts    ✅
    ├── screens/
    │   ├── Lobby.tsx        ✅
    │   ├── Planning.tsx     ✅
    │   ├── Heist.tsx        🔲 Phase 3
    │   ├── Resolution.tsx   🔲 Phase 4
    │   └── Replay.tsx       🔲 Phase 4
    ├── canvas/              🔲 Phase 3
    │   ├── MapRenderer.ts   — draw tiles
    │   ├── EntityLayer.ts   — draw players, loot, cameras, guards
    │   ├── FogOfWar.ts      — thief viewport clipping
    │   └── ReplayPlayer.ts  — scrub through snapshots
    └── tests/e2e/
        ├── lobby.spec.ts        ✅
        ├── multiplayer.spec.ts  ✅
        ├── planning.spec.ts     ✅
        ├── heist.spec.ts        🔲 Phase 3
        └── resolution.spec.ts   🔲 Phase 4
```

---

## Vibe

Fast, chaotic, and social. Games should last 5–8 minutes total. The experience should feel like a heist movie — thieves frantically whispering plans in chat while Security methodically closes off escape routes. The post-game replay is the punchline: thieves finally see how close Security was, or how badly Security misread their plan.
