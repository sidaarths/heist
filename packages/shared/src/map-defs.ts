export enum TileType {
  Floor = 'floor',
  Wall = 'wall',
  Door = 'door',
  Window = 'window',
  Vault = 'vault',
}

export interface MapRoom {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  tiles: TileType[][]
}

/** A door defined in the map layout — must be placed in a 1-tile wall gap between rooms. */
export interface DoorDef {
  id: string
  x: number
  y: number
  initiallyLocked: boolean
}

/** A camera defined in the map layout — fixed position and viewing angle. */
export interface CameraDef {
  id: string
  x: number
  y: number
  /** Viewing direction in radians (0=east, π/2=south, π=west, -π/2=north). */
  angle: number
  /** Half-angle of field of view in radians. */
  fov: number
}

export interface MapDef {
  id: string
  name: string
  width: number
  height: number
  rooms: MapRoom[]
  /** Fixed door positions — each must sit in a 1-tile wall gap between rooms. */
  doorDefs: DoorDef[]
  /** Fixed camera positions and viewing angles. */
  cameraDefs: CameraDef[]
  /** Where the escape exit tile is placed (must be inside a room). */
  exitPosition: { x: number; y: number }
  /** Room IDs where loot may randomly spawn. */
  lootRoomIds: string[]
  /** Room IDs where alarm panels may randomly spawn. */
  alarmRoomIds: string[]
  spawnPoints: {
    security: Array<{ x: number; y: number }>
    thieves: Array<{ x: number; y: number }>
  }
}

// ─── MAP 1: Clearwater Bank ───────────────────────────────────────────────────
//
// LOBBY(0,0 13×12) | gap | CORRIDOR(14,4 11×4) | gap | VAULT(26,0 13×12)
//   |                                                        |
//  gap                                                      gap (LOCKED)
//   |                                                        |
// SOUTH_HALL(4,13 4×7)                         BACK_OFFICE(26,13 13×11)
//   |
//  gap
//   |
// SEC_ROOM(0,21 18×8)
//
// Thieves: lobby top-left. Exit: vault right edge.
// Route: lobby → corridor (unlocked door) → vault (LOCKED) → back_office (LOCKED).
//
const MAP_1: MapDef = {
  id: 'clearwater_bank',
  name: 'Clearwater Bank',
  width: 40,
  height: 30,
  rooms: [
    { id: 'lobby',       name: 'Lobby',          x: 0,  y: 0,  width: 13, height: 12, tiles: [] },
    { id: 'corridor',    name: 'Corridor',        x: 14, y: 4,  width: 11, height: 4,  tiles: [] },
    { id: 'vault',       name: 'Vault',           x: 26, y: 0,  width: 13, height: 12, tiles: [] },
    { id: 'south_hall',  name: 'South Hall',      x: 4,  y: 13, width: 4,  height: 7,  tiles: [] },
    { id: 'sec_room',    name: 'Security Room',   x: 0,  y: 21, width: 18, height: 8,  tiles: [] },
    { id: 'back_office', name: 'Back Office',     x: 26, y: 13, width: 13, height: 11, tiles: [] },
  ],
  doorDefs: [
    // col 13 = gap between lobby(0-12) and corridor(14-24)
    { id: 'd1-lobby-corr',    x: 13, y: 6,  initiallyLocked: false },
    // col 25 = gap between corridor(14-24) and vault(26-38)
    { id: 'd2-corr-vault',    x: 25, y: 5,  initiallyLocked: true  },
    // row 12 = gap between lobby(0-11) and south_hall(13-19)
    { id: 'd3-lobby-south',   x: 5,  y: 12, initiallyLocked: false },
    // row 20 = gap between south_hall(13-19) and sec_room(21-28)
    { id: 'd4-south-sec',     x: 5,  y: 20, initiallyLocked: false },
    // row 12 = gap between vault(0-11) and back_office(13-23)
    { id: 'd5-vault-back',    x: 32, y: 12, initiallyLocked: true  },
  ],
  cameraDefs: [
    { id: 'c1', x: 7,  y: 5,  angle: 0,            fov: Math.PI / 2 },
    { id: 'c2', x: 19, y: 5,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'c3', x: 32, y: 5,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'c4', x: 32, y: 18, angle: -Math.PI / 2,  fov: Math.PI / 2 },
  ],
  exitPosition: { x: 37, y: 5 },
  lootRoomIds:  ['vault', 'back_office'],
  alarmRoomIds: ['lobby', 'vault', 'back_office'],
  spawnPoints: {
    security: [{ x: 4, y: 24 }, { x: 12, y: 24 }],
    thieves: [{ x: 3, y: 3 }, { x: 3, y: 8 }, { x: 9, y: 3 }, { x: 9, y: 8 }],
  },
}

// ─── MAP 2: Northgate Museum ──────────────────────────────────────────────────
//
// ENTRANCE(0,0 12×12) | gap | EAST_HALL(13,3 10×6) | gap | GALLERY(24,0 15×12)→EXIT
//    |                                                            |
//   gap                                                          gap (unlocked)
//    |                                                            |
// BACK_HALL(0,13 12×10)                              STOREROOM(24,13 15×10) (LOOT)
//    |
//   gap
//    |
// BASEMENT(0,24 22×5) [security]
//
const MAP_2: MapDef = {
  id: 'northgate_museum',
  name: 'Northgate Museum',
  width: 40,
  height: 30,
  rooms: [
    { id: 'entrance',   name: 'Entrance Hall',   x: 0,  y: 0,  width: 12, height: 12, tiles: [] },
    { id: 'east_hall',  name: 'East Corridor',   x: 13, y: 3,  width: 10, height: 6,  tiles: [] },
    { id: 'gallery',    name: 'Gallery',         x: 24, y: 0,  width: 15, height: 12, tiles: [] },
    { id: 'back_hall',  name: 'Back Hall',       x: 0,  y: 13, width: 12, height: 10, tiles: [] },
    { id: 'storeroom',  name: 'Storeroom',       x: 24, y: 13, width: 15, height: 10, tiles: [] },
    { id: 'basement',   name: 'Basement',        x: 0,  y: 24, width: 22, height: 5,  tiles: [] },
  ],
  doorDefs: [
    // col 12 = gap between entrance(0-11) and east_hall(13-22)
    { id: 'd1-ent-hall',    x: 12, y: 5,  initiallyLocked: false },
    // col 23 = gap between east_hall(13-22) and gallery(24-38)
    { id: 'd2-hall-gal',    x: 23, y: 5,  initiallyLocked: true  },
    // row 12 = gap between entrance(0-11) and back_hall(13-22)
    { id: 'd3-ent-back',    x: 5,  y: 12, initiallyLocked: false },
    // row 23 = gap between back_hall(13-22) and basement(24-28)
    { id: 'd4-back-base',   x: 5,  y: 23, initiallyLocked: false },
    // row 12 = gap between gallery(0-11) and storeroom(13-22)
    { id: 'd5-gal-store',   x: 31, y: 12, initiallyLocked: false },
  ],
  cameraDefs: [
    { id: 'c1', x: 6,  y: 5,  angle: 0,            fov: Math.PI / 2 },
    { id: 'c2', x: 17, y: 5,  angle: 0,             fov: Math.PI / 2 },
    { id: 'c3', x: 33, y: 5,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'c4', x: 33, y: 18, angle: -Math.PI / 2,  fov: Math.PI / 2 },
  ],
  exitPosition: { x: 37, y: 5 },
  lootRoomIds:  ['gallery', 'storeroom'],
  alarmRoomIds: ['entrance', 'gallery', 'storeroom'],
  spawnPoints: {
    security: [{ x: 3, y: 26 }, { x: 12, y: 26 }],
    thieves: [{ x: 3, y: 3 }, { x: 3, y: 8 }, { x: 8, y: 3 }, { x: 8, y: 8 }],
  },
}

// ─── MAP 3: Harrington Mansion ────────────────────────────────────────────────
//
// FOYER(0,4 12×10) | gap | DINING(13,0 12×8)─gap─KITCHEN(26,0 13×8)
//    |                         gap                     gap
//    |                       LIBRARY(13,9 12×10)(LOCKED)  STUDY(26,9 13×10)→EXIT
//    |
// HALLWAY(0,15 12×5)
//    |
// SEC_WING(0,21 22×8)
//
const MAP_3: MapDef = {
  id: 'harrington_mansion',
  name: 'Harrington Mansion',
  width: 40,
  height: 30,
  rooms: [
    { id: 'foyer',    name: 'Foyer',     x: 0,  y: 4,  width: 12, height: 10, tiles: [] },
    { id: 'dining',   name: 'Dining',    x: 13, y: 0,  width: 12, height: 8,  tiles: [] },
    { id: 'kitchen',  name: 'Kitchen',   x: 26, y: 0,  width: 13, height: 8,  tiles: [] },
    { id: 'library',  name: 'Library',   x: 13, y: 9,  width: 12, height: 10, tiles: [] },
    { id: 'study',    name: 'Study',     x: 26, y: 9,  width: 13, height: 10, tiles: [] },
    { id: 'hallway',  name: 'Hallway',   x: 0,  y: 15, width: 12, height: 5,  tiles: [] },
    { id: 'sec_wing', name: 'Sec Wing',  x: 0,  y: 21, width: 22, height: 8,  tiles: [] },
  ],
  doorDefs: [
    // col 12 = gap between foyer(0-11) and dining(13-24)
    { id: 'd1-foyer-dining',  x: 12, y: 6,  initiallyLocked: false },
    // col 25 = gap between dining(13-24) and kitchen(26-38)
    { id: 'd2-dining-kit',    x: 25, y: 4,  initiallyLocked: false },
    // row 8 = gap between dining(0-7) and library(9-18)
    { id: 'd3-dining-lib',    x: 18, y: 8,  initiallyLocked: true  },
    // row 8 = gap between kitchen(0-7) and study(9-18)
    { id: 'd4-kit-study',     x: 29, y: 8,  initiallyLocked: false },
    // row 14 = gap between foyer(4-13) and hallway(15-19)
    { id: 'd5-foyer-hall',    x: 5,  y: 14, initiallyLocked: false },
    // row 20 = gap between hallway(15-19) and sec_wing(21-28)
    { id: 'd6-hall-sec',      x: 5,  y: 20, initiallyLocked: false },
    // col 25 = gap between library(13-24) and study(26-38); row in library/study overlap (9-18)
    { id: 'd7-lib-study',     x: 25, y: 14, initiallyLocked: true  },
  ],
  cameraDefs: [
    { id: 'c1', x: 6,  y: 8,  angle: 0,            fov: Math.PI / 2 },
    { id: 'c2', x: 19, y: 3,  angle: 0,             fov: Math.PI / 2 },
    { id: 'c3', x: 19, y: 14, angle: Math.PI / 2,   fov: Math.PI / 2 },
    { id: 'c4', x: 32, y: 14, angle: Math.PI,       fov: Math.PI / 2 },
  ],
  exitPosition: { x: 37, y: 14 },
  lootRoomIds:  ['library', 'study'],
  alarmRoomIds: ['foyer', 'dining', 'library', 'study'],
  spawnPoints: {
    security: [{ x: 3, y: 24 }, { x: 12, y: 24 }],
    thieves: [{ x: 3, y: 6 }, { x: 3, y: 11 }, { x: 8, y: 6 }, { x: 8, y: 11 }],
  },
}

// ─── MAP 4: Harborside Warehouse ──────────────────────────────────────────────
//
// LOADING(0,0 12×10) | gap | CATWALK(13,3 14×4) | gap | COLD_STORAGE(28,0 11×10)(LOCKED)
//     |
//    gap
//     |
// MAIN_FLOOR(0,11 22×11) | gap | OFFICE(23,11 15×6)
//                                       |
//                                      gap (LOCKED)
//                                       |
//                               SERVER_ROOM(23,18 15×9)→EXIT
//     |
//    gap
//     |
// SEC_POST(0,23 22×6)
//
const MAP_4: MapDef = {
  id: 'harborside_warehouse',
  name: 'Harborside Warehouse',
  width: 40,
  height: 30,
  rooms: [
    { id: 'loading',     name: 'Loading Dock',   x: 0,  y: 0,  width: 12, height: 10, tiles: [] },
    { id: 'catwalk',     name: 'Catwalk',        x: 13, y: 3,  width: 14, height: 4,  tiles: [] },
    { id: 'cold_storage',name: 'Cold Storage',   x: 28, y: 0,  width: 11, height: 10, tiles: [] },
    { id: 'main_floor',  name: 'Main Floor',     x: 0,  y: 11, width: 22, height: 11, tiles: [] },
    { id: 'office',      name: 'Office',         x: 23, y: 11, width: 15, height: 6,  tiles: [] },
    { id: 'server_room', name: 'Server Room',    x: 23, y: 18, width: 15, height: 9,  tiles: [] },
    { id: 'sec_post',    name: 'Security Post',  x: 0,  y: 23, width: 22, height: 6,  tiles: [] },
  ],
  doorDefs: [
    // col 12 = gap between loading(0-11) and catwalk(13-26)
    { id: 'd1-load-cat',   x: 12, y: 4,  initiallyLocked: false },
    // col 27 = gap between catwalk(13-26) and cold_storage(28-38)
    { id: 'd2-cat-cold',   x: 27, y: 4,  initiallyLocked: true  },
    // row 10 = gap between loading(0-9) and main_floor(11-21)
    { id: 'd3-load-main',  x: 7,  y: 10, initiallyLocked: false },
    // col 22 = gap between main_floor(0-21) and office(23-37)
    { id: 'd4-main-off',   x: 22, y: 13, initiallyLocked: false },
    // row 17 = gap between office(11-16) and server_room(18-26)
    { id: 'd5-off-srv',    x: 30, y: 17, initiallyLocked: true  },
    // row 22 = gap between main_floor(11-21) and sec_post(23-28)
    { id: 'd6-main-sec',   x: 7,  y: 22, initiallyLocked: false },
  ],
  cameraDefs: [
    { id: 'c1', x: 6,  y: 4,  angle: 0,            fov: Math.PI / 2 },
    { id: 'c2', x: 20, y: 4,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'c3', x: 10, y: 16, angle: 0,             fov: Math.PI / 2 },
    { id: 'c4', x: 30, y: 22, angle: -Math.PI / 2,  fov: Math.PI / 2 },
  ],
  exitPosition: { x: 36, y: 22 },
  lootRoomIds:  ['office', 'server_room'],
  alarmRoomIds: ['loading', 'catwalk', 'office', 'server_room'],
  spawnPoints: {
    security: [{ x: 5, y: 25 }, { x: 12, y: 25 }],
    thieves: [{ x: 3, y: 3 }, { x: 3, y: 7 }, { x: 8, y: 3 }, { x: 8, y: 7 }],
  },
}

// ─── MAP 5: Casino Royale ─────────────────────────────────────────────────────
//
// LOBBY(0,0 12×10) | gap | CASINO_FLOOR(13,0 16×16) | gap | VIP_ROOM(30,0 9×10)(LOCKED)
//     |                             |                           |
//    gap                           gap                        gap (LOCKED)
//     |                             |                           |
// SEC_ROOM(0,11 12×10)         KITCHEN(13,17 16×5)      BACK_OFFICE(30,11 9×10)→EXIT
//     |                             |
//    gap                           gap
//     |                             |
// PASSAGE(0,23 29×6)──────────────────
//
const MAP_5: MapDef = {
  id: 'casino_royale',
  name: 'Casino Royale',
  width: 40,
  height: 30,
  rooms: [
    { id: 'lobby',       name: 'Lobby',          x: 0,  y: 0,  width: 12, height: 10, tiles: [] },
    { id: 'casino_floor',name: 'Casino Floor',   x: 13, y: 0,  width: 16, height: 16, tiles: [] },
    { id: 'vip_room',    name: 'VIP Room',       x: 30, y: 0,  width: 9,  height: 10, tiles: [] },
    { id: 'back_office', name: 'Counting Room',  x: 30, y: 11, width: 9,  height: 10, tiles: [] },
    { id: 'kitchen',     name: 'Kitchen',        x: 13, y: 17, width: 16, height: 5,  tiles: [] },
    { id: 'sec_room',    name: 'Security Room',  x: 0,  y: 11, width: 12, height: 10, tiles: [] },
    { id: 'passage',     name: 'Passage',        x: 0,  y: 23, width: 29, height: 6,  tiles: [] },
  ],
  doorDefs: [
    // col 12 = gap between lobby(0-11) and casino(13-28)
    { id: 'd1-lob-cas',   x: 12, y: 5,  initiallyLocked: false },
    // col 29 = gap between casino(13-28) and vip(30-38)
    { id: 'd2-cas-vip',   x: 29, y: 5,  initiallyLocked: true  },
    // col 29 = gap; row 15 in casino(0-15) and back_office(11-20)
    { id: 'd3-cas-back',  x: 29, y: 15, initiallyLocked: true  },
    // row 10 = gap between lobby(0-9) and sec_room(11-20)
    { id: 'd4-lob-sec',   x: 5,  y: 10, initiallyLocked: false },
    // row 16 = gap between casino(0-15) and kitchen(17-21)
    { id: 'd5-cas-kitch', x: 18, y: 16, initiallyLocked: false },
    // row 22 = gap between kitchen(17-21) and passage(23-28)
    { id: 'd6-kitch-pass',x: 18, y: 22, initiallyLocked: false },
    // row 21 = gap between sec_room(11-20) and passage(23-28) — gap rows 21-22, use 21
    { id: 'd7-sec-pass',  x: 5,  y: 21, initiallyLocked: false },
  ],
  cameraDefs: [
    { id: 'c1', x: 6,  y: 4,  angle: 0,            fov: Math.PI / 2 },
    { id: 'c2', x: 20, y: 7,  angle: 0,             fov: Math.PI / 2 },
    { id: 'c3', x: 34, y: 4,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'c4', x: 34, y: 16, angle: Math.PI,       fov: Math.PI / 2 },
  ],
  exitPosition: { x: 37, y: 15 },
  lootRoomIds:  ['vip_room', 'back_office'],
  alarmRoomIds: ['lobby', 'casino_floor', 'vip_room', 'back_office'],
  spawnPoints: {
    security: [{ x: 3, y: 15 }, { x: 8, y: 15 }],
    thieves: [{ x: 3, y: 3 }, { x: 3, y: 7 }, { x: 8, y: 3 }, { x: 8, y: 7 }],
  },
}

/** All available maps. One is chosen at random for each game. */
export const MAPS: MapDef[] = [MAP_1, MAP_2, MAP_3, MAP_4, MAP_5]

/** Pick a random map. */
export function getRandomMap(): MapDef {
  return MAPS[Math.floor(Math.random() * MAPS.length)]
}

/** Legacy alias — kept for any tests that import BASIC_MAP. */
export const BASIC_MAP: MapDef = MAP_1
