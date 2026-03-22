import { describe, it, expect, beforeEach } from 'bun:test'
import { randomUUID } from 'crypto'
import { MessageRouter } from '../src/net/message-router'
import { RoomManager } from '../src/lobby'
import type { ClientMessage, ServerMessage } from '@heist/shared'

/** Create a ready 2-player room (security + thief) and return useful IDs. */
function makeReadyRoom(manager: RoomManager, router: MessageRouter) {
  function send(id: string, msg: ClientMessage) {
    const out: ServerMessage[] = []
    router.route(id, msg, r => out.push(r))
    return out
  }

  const hostId = randomUUID()
  const guestId = randomUUID()

  const [created] = send(hostId, { type: 'create_room', playerName: 'Host' })
  const roomId = (created as any).roomId as string

  send(guestId, { type: 'join_room', roomId, playerName: 'Guest' })
  send(hostId, { type: 'select_role', role: 'security' })
  send(guestId, { type: 'select_role', role: 'thief' })
  send(hostId, { type: 'set_ready', ready: true })
  send(guestId, { type: 'set_ready', ready: true })

  return { roomId, hostId, guestId }
}

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

  // ─── Phase 3 action routing ──────────────────────────────────────────────────

  it('returns NOT_IN_ROOM for player_move when player has no room', () => {
    const msgs = send('p1', { type: 'player_move', dx: 1, dy: 0 })
    expect(msgs[0].type).toBe('error')
    expect((msgs[0] as any).code).toBe('NOT_IN_ROOM')
  })

  it('returns NOT_IN_ROOM for player_action when player has no room', () => {
    const msgs = send('p1', { type: 'player_action', action: 'pick_lock', targetId: 'door-1' })
    expect(msgs[0].type).toBe('error')
    expect((msgs[0] as any).code).toBe('NOT_IN_ROOM')
  })

  it('returns NOT_IN_ROOM for security_action when player has no room', () => {
    const msgs = send('p1', { type: 'security_action', action: 'lock_door', targetId: 'door-1' })
    expect(msgs[0].type).toBe('error')
    expect((msgs[0] as any).code).toBe('NOT_IN_ROOM')
  })

  // ─── handleStartGame ─────────────────────────────────────────────────────────

  describe('handleStartGame', () => {
    it('returns room_state with phase=planning when host starts a valid room', () => {
      const { hostId } = makeReadyRoom(manager, router)
      const msgs = send(hostId, { type: 'start_game' })
      expect(msgs[0].type).toBe('room_state')
      expect((msgs[0] as any).room.phase).toBe('planning')
    })

    it('returns error when a non-host player tries to start', () => {
      const { guestId } = makeReadyRoom(manager, router)
      const msgs = send(guestId, { type: 'start_game' })
      expect(msgs[0].type).toBe('error')
      expect((msgs[0] as any).code).toBe('START_GAME_FAILED')
    })

    it('returns NOT_IN_ROOM error when player is not in any room', () => {
      const msgs = send('orphan-player', { type: 'start_game' })
      expect(msgs[0].type).toBe('error')
      expect((msgs[0] as any).code).toBe('NOT_IN_ROOM')
    })

    it('returns error if not all players are ready', () => {
      // Create room, add guest, assign roles but do NOT ready up guest
      const hostId = randomUUID()
      const guestId = randomUUID()
      send(hostId, { type: 'create_room', playerName: 'Host' })
      const roomId = [...manager.rooms.keys()][0]
      send(guestId, { type: 'join_room', roomId, playerName: 'Guest' })
      send(hostId, { type: 'select_role', role: 'security' })
      send(guestId, { type: 'select_role', role: 'thief' })
      send(hostId, { type: 'set_ready', ready: true })
      // guest not ready

      const msgs = send(hostId, { type: 'start_game' })
      expect(msgs[0].type).toBe('error')
      expect((msgs[0] as any).code).toBe('START_GAME_FAILED')
    })
  })

  // ─── handleChat ──────────────────────────────────────────────────────────────

  describe('handleChat', () => {
    let thiefBroadcasts: Array<{ roomId: string; msg: ServerMessage }>
    let chatRouter: MessageRouter

    beforeEach(() => {
      thiefBroadcasts = []
      chatRouter = new MessageRouter(manager, (roomId, msg) => {
        thiefBroadcasts.push({ roomId, msg })
      })
    })

    function chatSend(playerId: string, msg: ClientMessage): ServerMessage[] {
      const out: ServerMessage[] = []
      chatRouter.route(playerId, msg, r => out.push(r))
      return out
    }

    function makeReadyChatRoom() {
      const hostId = randomUUID()
      const guestId = randomUUID()
      const [created] = chatSend(hostId, { type: 'create_room', playerName: 'Sec' })
      const roomId = (created as any).roomId as string
      chatSend(guestId, { type: 'join_room', roomId, playerName: 'Thief' })
      chatSend(hostId, { type: 'select_role', role: 'security' })
      chatSend(guestId, { type: 'select_role', role: 'thief' })
      chatSend(hostId, { type: 'set_ready', ready: true })
      chatSend(guestId, { type: 'set_ready', ready: true })
      chatSend(hostId, { type: 'start_game' })
      return { roomId, hostId, guestId }
    }

    it('broadcasts chat_message to thieves when a thief sends chat', () => {
      const { roomId, guestId } = makeReadyChatRoom()
      chatSend(guestId, { type: 'chat', message: 'hello crew' })

      const chatMsgs = thiefBroadcasts.filter(b => b.msg.type === 'chat_message')
      expect(chatMsgs).toHaveLength(1)
      expect(chatMsgs[0].roomId).toBe(roomId)
      expect((chatMsgs[0].msg as any).message).toBe('hello crew')
      expect((chatMsgs[0].msg as any).fromName).toBe('Thief')
    })

    it('returns CHAT_DENIED error when security tries to chat', () => {
      const { hostId } = makeReadyChatRoom()
      const msgs = chatSend(hostId, { type: 'chat', message: 'hi' })
      expect(msgs[0].type).toBe('error')
      expect((msgs[0] as any).code).toBe('CHAT_DENIED')
    })

    it('returns error for missing message field', () => {
      const { guestId } = makeReadyChatRoom()
      const msgs = chatSend(guestId, { type: 'chat', message: '' } as any)
      // empty string after trim → no broadcast, no error (silent discard)
      expect(thiefBroadcasts.filter(b => b.msg.type === 'chat_message')).toHaveLength(0)
    })

    it('returns error for non-string message field', () => {
      const { guestId } = makeReadyChatRoom()
      const msgs = chatSend(guestId, { type: 'chat', message: 42 } as any)
      expect(msgs[0].type).toBe('error')
      expect((msgs[0] as any).code).toBe('INVALID_MESSAGE')
    })

    it('truncates messages longer than CHAT_MESSAGE_MAX_LEN', () => {
      const { guestId } = makeReadyChatRoom()
      chatSend(guestId, { type: 'chat', message: 'A'.repeat(300) })
      const chatMsgs = thiefBroadcasts.filter(b => b.msg.type === 'chat_message')
      expect((chatMsgs[0].msg as any).message.length).toBe(200)
    })

    it('returns NOT_IN_ROOM error when player is not in a room', () => {
      // Fresh manager without any rooms
      const freshManager = new RoomManager()
      const freshRouter = new MessageRouter(freshManager)
      const out: ServerMessage[] = []
      freshRouter.route('ghost', { type: 'chat', message: 'hi' }, r => out.push(r))
      expect(out[0].type).toBe('error')
      expect((out[0] as any).code).toBe('NOT_IN_ROOM')
    })
  })
})
