import { describe, it, expect, beforeEach } from 'bun:test'
import { randomUUID } from 'crypto'
import { RoomManager } from '../src/lobby'
import { MAX_PLAYERS, MAX_ROOMS, MIN_PLAYERS, ROOM_CODE_LENGTH } from '@heist/shared'

describe('RoomManager', () => {
  let manager: RoomManager

  beforeEach(() => {
    manager = new RoomManager()
  })

  describe('createRoom', () => {
    it('generates a 6-character alphanumeric room code', () => {
      const result = manager.createRoom('Alice', randomUUID())
      if ('error' in result) throw new Error(result.error)
      expect(result.room.id).toMatch(/^[A-Z0-9]{6}$/)
      expect(result.room.id.length).toBe(ROOM_CODE_LENGTH)
    })

    it('assigns the creator as host', () => {
      const playerId = randomUUID()
      const result = manager.createRoom('Alice', playerId)
      if ('error' in result) throw new Error(result.error)
      expect(result.room.hostId).toBe(playerId)
      expect(result.player.id).toBe(playerId)
    })

    it('sets initial phase to lobby', () => {
      const result = manager.createRoom('Alice', randomUUID())
      if ('error' in result) throw new Error(result.error)
      expect(result.room.phase).toBe('lobby')
    })

    it('adds the creator as first player with unassigned role', () => {
      const result = manager.createRoom('Alice', randomUUID())
      if ('error' in result) throw new Error(result.error)
      expect(result.room.players).toHaveLength(1)
      expect(result.room.players[0].name).toBe('Alice')
      expect(result.room.players[0].role).toBe('unassigned')
      expect(result.room.players[0].ready).toBe(false)
      expect(result.room.players[0].connected).toBe(true)
    })

    it('rejects creation if max rooms reached', () => {
      // Fill up to MAX_ROOMS
      for (let i = 0; i < MAX_ROOMS; i++) {
        manager.createRoom(`Player${i}`, randomUUID())
      }
      const result = manager.createRoom('OneMore', randomUUID())
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('max')
      }
    })
  })

  describe('joinRoom', () => {
    it('adds player to existing room', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const roomId = createResult.room.id

      const joinResult = manager.joinRoom(roomId, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      expect(joinResult.room.players).toHaveLength(2)
      expect(joinResult.player.name).toBe('Bob')
    })

    it('returns error for unknown room code', () => {
      const result = manager.joinRoom('XXXXXX', 'Bob', randomUUID())
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('not found')
      }
    })

    it('rejects if room is full (5 players)', () => {
      const createResult = manager.createRoom('Player1', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const roomId = createResult.room.id

      for (let i = 2; i <= MAX_PLAYERS; i++) {
        const r = manager.joinRoom(roomId, `Player${i}`, randomUUID())
        if ('error' in r) throw new Error(r.error)
      }

      const result = manager.joinRoom(roomId, 'PlayerExtra', randomUUID())
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('full')
      }
    })

    it('rejects if game has already started (not in lobby phase)', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const roomId = createResult.room.id

      // Force room to non-lobby phase by manipulating internal state
      const room = manager.getRoom(roomId)!
      room.phase = 'planning'

      const result = manager.joinRoom(roomId, 'Bob', randomUUID())
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('started')
      }
    })

    it('room codes are case-insensitive', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const roomId = createResult.room.id.toLowerCase()

      const joinResult = manager.joinRoom(roomId, 'Bob', randomUUID())
      expect('error' in joinResult).toBe(false)
      if (!('error' in joinResult)) {
        expect(joinResult.room.players).toHaveLength(2)
      }
    })
  })

  describe('selectRole', () => {
    it('allows one player to claim Security role', () => {
      const playerId = randomUUID()
      const createResult = manager.createRoom('Alice', playerId)
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player } = createResult

      const result = manager.selectRole(room.id, player.id, 'security')
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        const p = result.room.players.find(p => p.id === player.id)
        expect(p?.role).toBe('security')
      }
    })

    it('rejects second player claiming Security', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      manager.selectRole(room.id, alice.id, 'security')

      const joinResult = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      const bob = joinResult.player

      const result = manager.selectRole(room.id, bob.id, 'security')
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('taken')
      }
    })

    it('allows role change before ready', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player } = createResult

      manager.selectRole(room.id, player.id, 'thief')
      const result = manager.selectRole(room.id, player.id, 'security')
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        const p = result.room.players.find(p => p.id === player.id)
        expect(p?.role).toBe('security')
      }
    })

    it('does not allow role change after ready', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player } = createResult

      manager.selectRole(room.id, player.id, 'thief')
      manager.setReady(room.id, player.id, true)

      const result = manager.selectRole(room.id, player.id, 'security')
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('ready')
      }
    })

    it('assigns remaining players as thieves', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const joinResult = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      const bob = joinResult.player

      manager.selectRole(room.id, alice.id, 'security')

      const result = manager.selectRole(room.id, bob.id, 'thief')
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        const bobPlayer = result.room.players.find(p => p.id === bob.id)
        expect(bobPlayer?.role).toBe('thief')
      }
    })
  })

  describe('setReady', () => {
    it('marks a player as ready', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player } = createResult

      const result = manager.setReady(room.id, player.id, true)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        const p = result.room.players.find(p => p.id === player.id)
        expect(p?.ready).toBe(true)
      }
    })

    it('does not auto-start game when players ready up (host must call startGame)', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      manager.selectRole(room.id, alice.id, 'security')

      const joinResult = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      const bob = joinResult.player
      manager.selectRole(room.id, bob.id, 'thief')

      // Only 2 players, game should not start
      manager.setReady(room.id, alice.id, true)
      const result = manager.setReady(room.id, bob.id, true)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.started).toBe(false)
      }
    })

    it('does not start game if no Security assigned', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error(j1.error)
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error(j2.error)

      // No security role assigned — all unassigned
      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      const result = manager.setReady(room.id, j2.player.id, true)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.started).toBe(false)
      }
    })

    it('does not start game if any player has unassigned role', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error(j1.error)
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error(j2.error)

      // Alice is security, Bob is thief, Charlie stays unassigned
      manager.selectRole(room.id, alice.id, 'security')
      manager.selectRole(room.id, j1.player.id, 'thief')
      // j2 stays 'unassigned'

      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      const result = manager.setReady(room.id, j2.player.id, true)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.started).toBe(false)
      }
    })

    it('setReady no longer auto-transitions — phase stays lobby until host calls startGame', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error(j1.error)
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error(j2.error)

      manager.selectRole(room.id, alice.id, 'security')
      manager.selectRole(room.id, j1.player.id, 'thief')
      manager.selectRole(room.id, j2.player.id, 'thief')

      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      const readyResult = manager.setReady(room.id, j2.player.id, true)

      expect('error' in readyResult).toBe(false)
      if (!('error' in readyResult)) {
        expect(readyResult.started).toBe(false)
        expect(readyResult.room.phase).toBe('lobby')
      }

      // Host explicitly starts the game
      const startResult = manager.startGame(room.id, alice.id)
      expect('error' in startResult).toBe(false)
      if (!('error' in startResult)) {
        expect(startResult.room.phase).toBe('planning')
      }
    })

  })

  describe('startGame', () => {
    function makeReadyRoom() {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error('createRoom failed')
      const { room, player: alice } = createResult
      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error('joinRoom failed')
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error('joinRoom failed')
      manager.selectRole(room.id, alice.id, 'security')
      manager.selectRole(room.id, j1.player.id, 'thief')
      manager.selectRole(room.id, j2.player.id, 'thief')
      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      manager.setReady(room.id, j2.player.id, true)
      return { room, alice, bob: j1.player, charlie: j2.player }
    }

    it('host can start the game when all conditions are met', () => {
      const { room, alice } = makeReadyRoom()
      const result = manager.startGame(room.id, alice.id)
      expect('error' in result).toBe(false)
      if (!('error' in result)) expect(result.room.phase).toBe('planning')
    })

    it('rejects start from a non-host player', () => {
      const { room, bob } = makeReadyRoom()
      const result = manager.startGame(room.id, bob.id)
      expect('error' in result).toBe(true)
    })

    it('rejects start when not all players are ready', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error()
      const { room, player: alice } = createResult
      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error()
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error()
      manager.selectRole(room.id, alice.id, 'security')
      manager.selectRole(room.id, j1.player.id, 'thief')
      manager.selectRole(room.id, j2.player.id, 'thief')
      manager.setReady(room.id, alice.id, true)
      // Bob and Charlie not ready
      const result = manager.startGame(room.id, alice.id)
      expect('error' in result).toBe(true)
    })

    it('rejects start with fewer than MIN_PLAYERS (solo host)', () => {
      // Only 1 player (the host) — below the 2-player minimum
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error()
      const { room, player: alice } = createResult
      manager.selectRole(room.id, alice.id, 'security')
      manager.setReady(room.id, alice.id, true)
      const result = manager.startGame(room.id, alice.id)
      expect('error' in result).toBe(true)
    })

    it('starts game successfully with MIN_PLAYERS (1 security + 1 thief)', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error()
      const { room, player: alice } = createResult
      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error()
      manager.selectRole(room.id, alice.id, 'security')
      manager.selectRole(room.id, j1.player.id, 'thief')
      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      const result = manager.startGame(room.id, alice.id)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.room.phase).toBe('planning')
      }
    })

    it('rejects start without a security player', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error()
      const { room, player: alice } = createResult
      const j1 = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in j1) throw new Error()
      const j2 = manager.joinRoom(room.id, 'Charlie', randomUUID())
      if ('error' in j2) throw new Error()
      manager.selectRole(room.id, alice.id, 'thief')
      manager.selectRole(room.id, j1.player.id, 'thief')
      manager.selectRole(room.id, j2.player.id, 'thief')
      manager.setReady(room.id, alice.id, true)
      manager.setReady(room.id, j1.player.id, true)
      manager.setReady(room.id, j2.player.id, true)
      const result = manager.startGame(room.id, alice.id)
      expect('error' in result).toBe(true)
    })
  })

  describe('setReady (continued)', () => {
    it('unready resets if player changes role', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player } = createResult

      manager.selectRole(room.id, player.id, 'thief')
      manager.setReady(room.id, player.id, true)

      // Verify player is ready
      const roomBefore = manager.getRoom(room.id)!
      const playerBefore = roomBefore.players.find(p => p.id === player.id)
      expect(playerBefore?.ready).toBe(true)

      // Now try to change role (should fail while ready)
      const changeResult = manager.selectRole(room.id, player.id, 'security')
      expect('error' in changeResult).toBe(true)
    })
  })

  describe('leaveRoom', () => {
    it('removes player from room', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const joinResult = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      const bob = joinResult.player

      const result = manager.leaveRoom(room.id, bob.id)
      expect(result.room).not.toBeNull()
      expect(result.room?.players).toHaveLength(1)
      expect(result.room?.players[0].id).toBe(alice.id)
    })

    it('reassigns host if host leaves', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const joinResult = manager.joinRoom(room.id, 'Bob', randomUUID())
      if ('error' in joinResult) throw new Error(joinResult.error)
      const bob = joinResult.player

      const result = manager.leaveRoom(room.id, alice.id)
      expect(result.room?.hostId).toBe(bob.id)
    })

    it('cleans up empty rooms', () => {
      const createResult = manager.createRoom('Alice', randomUUID())
      if ('error' in createResult) throw new Error(createResult.error)
      const { room, player: alice } = createResult

      const result = manager.leaveRoom(room.id, alice.id)
      expect(result.room).toBeNull()
      expect(manager.getRoom(room.id)).toBeUndefined()
    })
  })
})
