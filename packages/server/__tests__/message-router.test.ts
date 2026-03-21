import { describe, it, expect, beforeEach } from 'bun:test'
import { MessageRouter } from '../src/net/message-router'
import { RoomManager } from '../src/lobby'
import type { ClientMessage, ServerMessage } from '@heist/shared'

describe('MessageRouter', () => {
  let router: MessageRouter
  let manager: RoomManager
  let responses: ServerMessage[]

  beforeEach(() => {
    manager = new RoomManager()
    responses = []
    router = new MessageRouter(manager)
  })

  function send(playerId: string, msg: ClientMessage): ServerMessage[] {
    const collected: ServerMessage[] = []
    router.route(playerId, msg, (response) => collected.push(response))
    return collected
  }

  it('routes create_room message to lobby handler', () => {
    const msgs = send('player-1', { type: 'create_room', playerName: 'Alice' })
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('room_created')
  })

  it('routes join_room message to lobby handler', () => {
    // First create a room
    const createMsgs = send('player-1', { type: 'create_room', playerName: 'Alice' })
    expect(createMsgs[0].type).toBe('room_created')
    const roomCreated = createMsgs[0] as { type: 'room_created'; roomId: string; playerId: string }
    const roomId = roomCreated.roomId

    const joinMsgs = send('player-2', { type: 'join_room', roomId, playerName: 'Bob' })
    expect(joinMsgs).toHaveLength(1)
    expect(joinMsgs[0].type).toBe('room_joined')
  })

  it('routes select_role message to lobby handler', () => {
    // Create room first
    const createMsgs = send('player-1', { type: 'create_room', playerName: 'Alice' })
    const roomCreated = createMsgs[0] as { type: 'room_created'; roomId: string; playerId: string }

    const msgs = send('player-1', { type: 'select_role', role: 'security' })
    expect(msgs).toHaveLength(1)
    // Should get room_state or player_updated back
    expect(['room_state', 'player_updated', 'error'].includes(msgs[0].type)).toBe(true)
  })

  it('routes set_ready message to lobby handler', () => {
    // Create room
    const createMsgs = send('player-1', { type: 'create_room', playerName: 'Alice' })
    const roomCreated = createMsgs[0] as { type: 'room_created'; roomId: string; playerId: string }

    const msgs = send('player-1', { type: 'set_ready', ready: true })
    expect(msgs).toHaveLength(1)
    expect(['room_state', 'error'].includes(msgs[0].type)).toBe(true)
  })

  it('rejects unknown message types with error response', () => {
    const msgs = send('player-1', { type: 'unknown_type' } as unknown as ClientMessage)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('error')
    const errMsg = msgs[0] as { type: 'error'; code: string; message: string }
    expect(errMsg.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })

  it('validates message has required fields before routing', () => {
    // join_room without required roomId
    const msgs = send('player-1', { type: 'join_room' } as unknown as ClientMessage)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('error')
    const errMsg = msgs[0] as { type: 'error'; code: string; message: string }
    expect(errMsg.code).toBe('INVALID_MESSAGE')
  })

  it('returns error when player sends message for wrong phase', () => {
    // Sending select_role before joining a room
    const msgs = send('player-orphan', { type: 'select_role', role: 'thief' })
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('error')
    const errMsg = msgs[0] as { type: 'error'; code: string; message: string }
    expect(errMsg.code).toBe('NOT_IN_ROOM')
  })
})
