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

export interface MapDef {
  id: string
  name: string
  width: number
  height: number
  rooms: MapRoom[]
  spawnPoints: {
    security: Array<{ x: number; y: number }>
    thieves: Array<{ x: number; y: number }>
  }
}

// Basic map layout: a simple office building with a vault
export const BASIC_MAP: MapDef = {
  id: 'basic',
  name: 'Clearwater Bank',
  width: 40,
  height: 30,
  rooms: [
    {
      id: 'lobby',
      name: 'Lobby',
      x: 0,
      y: 0,
      width: 20,
      height: 15,
      tiles: [],
    },
    {
      id: 'vault',
      name: 'Vault',
      x: 25,
      y: 10,
      width: 10,
      height: 10,
      tiles: [],
    },
    {
      id: 'security_room',
      name: 'Security Room',
      x: 0,
      y: 20,
      width: 15,
      height: 10,
      tiles: [],
    },
  ],
  spawnPoints: {
    security: [{ x: 5, y: 25 }],
    thieves: [
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 15, y: 5 },
      { x: 5, y: 10 },
    ],
  },
}
