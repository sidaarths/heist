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

/** A door defined in the map layout — position and initial lock state. */
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
  /** Fixed door positions with initial lock state. */
  doorDefs: DoorDef[]
  /** Fixed camera positions and viewing angles. */
  cameraDefs: CameraDef[]
  /** Where the escape exit tile is placed. */
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

/**
 * Clearwater Bank (40×30)
 *
 * Layout:
 *   lobby (0,0 16×12)  ─[D]─  east_hall (16,4 8×4)  ─[D★]─  vault (24,0 16×12)
 *      |                                                            |
 *   [D]|                                                          [D★]
 *   south_hall (4,12 4×8)                              back_room (20,12 20×17)
 *      |                                                            |
 *   [D]|                                                          [D]|
 *   sec_room (0,20 20×9) ─────────────────────────────────────────
 *
 *   ★ = initially locked (thieves must pick the lock)
 *
 * Thieves spawn in lobby (top-left). Exit is deep in the vault (top-right).
 * Security spawns in the Security Room (bottom-left).
 */
export const BASIC_MAP: MapDef = {
  id: 'basic',
  name: 'Clearwater Bank',
  width: 40,
  height: 30,
  rooms: [
    { id: 'lobby',      name: 'Lobby',          x: 0,  y: 0,  width: 16, height: 12, tiles: [] },
    { id: 'east_hall',  name: 'East Corridor',   x: 16, y: 4,  width: 8,  height: 4,  tiles: [] },
    { id: 'vault',      name: 'Vault',           x: 24, y: 0,  width: 16, height: 12, tiles: [] },
    { id: 'south_hall', name: 'South Corridor',  x: 4,  y: 12, width: 4,  height: 8,  tiles: [] },
    { id: 'sec_room',   name: 'Security Room',   x: 0,  y: 20, width: 20, height: 9,  tiles: [] },
    { id: 'back_room',  name: 'Back Office',     x: 20, y: 12, width: 20, height: 17, tiles: [] },
  ],
  doorDefs: [
    // Lobby east wall → east corridor (unlocked)
    { id: 'door-lobby-east',  x: 15, y: 6,  initiallyLocked: false },
    // East corridor → vault entrance (LOCKED — thieves must pick)
    { id: 'door-vault-west',  x: 23, y: 6,  initiallyLocked: true  },
    // Lobby south wall → south corridor (unlocked)
    { id: 'door-lobby-south', x: 6,  y: 11, initiallyLocked: false },
    // South corridor → security room (unlocked)
    { id: 'door-hall-south',  x: 6,  y: 19, initiallyLocked: false },
    // Vault south wall → back office (LOCKED)
    { id: 'door-vault-south', x: 30, y: 11, initiallyLocked: true  },
    // Security room east wall → back office (unlocked)
    { id: 'door-sec-east',    x: 19, y: 24, initiallyLocked: false },
  ],
  cameraDefs: [
    { id: 'cam-lobby',  x: 7,  y: 5,  angle: 0,             fov: Math.PI / 2 },
    { id: 'cam-hall',   x: 19, y: 5,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'cam-vault',  x: 31, y: 5,  angle: Math.PI,       fov: Math.PI / 2 },
    { id: 'cam-back',   x: 28, y: 18, angle: -Math.PI / 2,  fov: Math.PI / 2 },
    { id: 'cam-sec',    x: 8,  y: 23, angle:  Math.PI / 2,  fov: Math.PI / 2 },
  ],
  exitPosition: { x: 38, y: 8 },
  lootRoomIds:  ['vault', 'back_room'],
  alarmRoomIds: ['lobby', 'vault', 'back_room', 'sec_room'],
  spawnPoints: {
    security: [{ x: 6, y: 23 }, { x: 12, y: 23 }],
    thieves: [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
    ],
  },
}
