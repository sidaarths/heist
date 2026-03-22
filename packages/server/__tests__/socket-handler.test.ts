import { describe, it, expect, beforeEach } from 'bun:test'
import { randomUUID } from 'crypto'
import { RoomManager } from '../src/lobby'
import { SocketHandler } from '../src/net/socket-handler'
import type { ServerMessage } from '@heist/shared'

// Minimal WebSocket mock
function makeWs(playerId: string): { ws: any; sent: ServerMessage[] } {
  const sent: ServerMessage[] = []
  const ws = {
    data: { playerId },
    send(raw: string) {
      sent.push(JSON.parse(raw) as ServerMessage)
    },
    subscribe(_topic: string) {},
    readyState: 1,
  }
  return { ws, sent }
}

describe('SocketHandler', () => {
  let manager: RoomManager
  let handler: SocketHandler

  beforeEach(() => {
    manager = new RoomManager()
    handler = new SocketHandler(manager)
  })

  describe('open / close', () => {
    it('registers the connection on open', () => {
      const { ws } = makeWs('p1')
      handler.open(ws)
      expect(handler.connections.has('p1')).toBe(true)
    })

    it('removes the connection on close', () => {
      const { ws } = makeWs('p1')
      handler.open(ws)
      handler.close(ws, 1000, '')
      expect(handler.connections.has('p1')).toBe(false)
    })
  })

  describe('broadcastRoomState after room creation', () => {
    it('creator receives room_state after create_room', () => {
      const { ws, sent } = makeWs('p1')
      handler.open(ws)

      handler.message(ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))

      const roomCreated = sent.find(m => m.type === 'room_created')
      expect(roomCreated).toBeDefined()

      const roomState = sent.find(m => m.type === 'room_state')
      expect(roomState).toBeDefined()
      expect((roomState as any).room.players).toHaveLength(1)
      expect((roomState as any).room.players[0].name).toBe('Alice')
    })

    it('does NOT send room_state to unrelated connections', () => {
      const p1 = makeWs('p1')
      const p2 = makeWs('p2')
      handler.open(p1.ws)
      handler.open(p2.ws)

      // p1 creates a room — p2 should NOT receive p1's room_state
      handler.message(p1.ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))

      const p2RoomState = p2.sent.find(m => m.type === 'room_state')
      expect(p2RoomState).toBeUndefined()
    })

    it('all room members receive room_state when a player joins', () => {
      const p1 = makeWs('p1')
      const p2 = makeWs('p2')
      handler.open(p1.ws)
      handler.open(p2.ws)

      // p1 creates a room
      handler.message(p1.ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))
      const roomCreated = p1.sent.find(m => m.type === 'room_created') as any
      const roomId = roomCreated.roomId

      // Clear p1's messages so we can track new ones
      p1.sent.length = 0

      // p2 joins
      handler.message(p2.ws, JSON.stringify({ type: 'join_room', roomId, playerName: 'Bob' }))

      // Both players should receive room_state with 2 players
      const p1State = p1.sent.find(m => m.type === 'room_state') as any
      const p2State = p2.sent.find(m => m.type === 'room_state') as any

      expect(p1State).toBeDefined()
      expect(p1State.room.players).toHaveLength(2)

      expect(p2State).toBeDefined()
      expect(p2State.room.players).toHaveLength(2)
    })

    it('does NOT send room_state to a third unrelated connection when a player joins', () => {
      const p1 = makeWs('p1')
      const p2 = makeWs('p2')
      const p3 = makeWs('p3') // in a different room
      handler.open(p1.ws)
      handler.open(p2.ws)
      handler.open(p3.ws)

      handler.message(p1.ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))
      const roomCreated = p1.sent.find(m => m.type === 'room_created') as any
      const roomId = roomCreated.roomId

      p3.sent.length = 0 // clear any earlier messages

      handler.message(p2.ws, JSON.stringify({ type: 'join_room', roomId, playerName: 'Bob' }))

      // p3 must NOT receive anything about p1's room
      const p3State = p3.sent.find(m => m.type === 'room_state')
      expect(p3State).toBeUndefined()
    })
  })

  describe('role and ready state broadcasting', () => {
    function setupRoom() {
      const p1 = makeWs('p1')
      const p2 = makeWs('p2')
      handler.open(p1.ws)
      handler.open(p2.ws)

      handler.message(p1.ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))
      const roomCreated = p1.sent.find(m => m.type === 'room_created') as any
      const roomId = roomCreated.roomId

      handler.message(p2.ws, JSON.stringify({ type: 'join_room', roomId, playerName: 'Bob' }))

      p1.sent.length = 0
      p2.sent.length = 0

      return { p1, p2 }
    }

    it('other room members receive room_state when a player selects a role', () => {
      const { p1, p2 } = setupRoom()

      handler.message(p1.ws, JSON.stringify({ type: 'select_role', role: 'security' }))

      // p1 gets direct response; p2 should also get room_state
      const p2State = p2.sent.find(m => m.type === 'room_state') as any
      expect(p2State).toBeDefined()
      expect(p2State.room.players.find((p: any) => p.name === 'Alice').role).toBe('security')
    })

    it('other room members receive room_state when a player readies up', () => {
      const { p1, p2 } = setupRoom()

      handler.message(p1.ws, JSON.stringify({ type: 'select_role', role: 'security' }))
      p1.sent.length = 0
      p2.sent.length = 0

      handler.message(p1.ws, JSON.stringify({ type: 'set_ready', ready: true }))

      const p2State = p2.sent.find(m => m.type === 'room_state') as any
      expect(p2State).toBeDefined()
      expect(p2State.room.players.find((p: any) => p.name === 'Alice').ready).toBe(true)
    })
  })

  describe('disconnect handling', () => {
    it('remaining players receive updated room_state when a player disconnects', () => {
      const p1 = makeWs('p1')
      const p2 = makeWs('p2')
      handler.open(p1.ws)
      handler.open(p2.ws)

      handler.message(p1.ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))
      const roomCreated = p1.sent.find(m => m.type === 'room_created') as any
      handler.message(p2.ws, JSON.stringify({ type: 'join_room', roomId: roomCreated.roomId, playerName: 'Bob' }))

      p1.sent.length = 0
      p2.sent.length = 0

      // p2 disconnects
      handler.close(p2.ws, 1000, '')

      // p1 should receive room_state with 1 player
      const p1State = p1.sent.find(m => m.type === 'room_state') as any
      expect(p1State).toBeDefined()
      expect(p1State.room.players).toHaveLength(1)
      expect(p1State.room.players[0].name).toBe('Alice')
    })

    it('rate limits connections sending too many messages', () => {
      const { ws, sent } = makeWs('p1')
      handler.open(ws)

      // Send 21 messages rapidly (limit is 20/s)
      handler.message(ws, JSON.stringify({ type: 'create_room', playerName: 'Alice' }))
      for (let i = 0; i < 20; i++) {
        handler.message(ws, JSON.stringify({ type: 'set_ready', ready: false }))
      }

      const rateLimited = sent.find(
        m => m.type === 'error' && (m as any).code === 'RATE_LIMITED'
      )
      expect(rateLimited).toBeDefined()
    })
  })
})
