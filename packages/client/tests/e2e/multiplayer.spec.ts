/**
 * multiplayer.spec.ts — Two-player lobby sync flows.
 *
 * Uses two independent browser contexts (each with its own WebSocket
 * connection) to verify real-time sync between players:
 *
 *  1. Player 2 can join a room created by player 1.
 *  2. Both players see each other in the crew manifest.
 *  3. Player count updates to 2/5 AGENTS on both screens.
 *  4. Security role is shown as taken and disabled for player 2.
 *  5. Both players receive ready badges when each readies up.
 *  6. Player 1 leaving removes them from player 2's list.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { goHome, createRoom, joinRoom, selectRoleAndReady } from '../helpers/game'

// ─── Two-context fixture ──────────────────────────────────────────────────────

const twoPlayerTest = test.extend<{
  ctxA: BrowserContext
  ctxB: BrowserContext
  pageA: Page
  pageB: Page
}>({
  ctxA: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext()
    await use(ctx)
    await ctx.close()
  },
  ctxB: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext()
    await use(ctx)
    await ctx.close()
  },
  pageA: async ({ ctxA }, use) => {
    const page = await ctxA.newPage()
    await use(page)
  },
  pageB: async ({ ctxB }, use) => {
    const page = await ctxB.newPage()
    await use(page)
  },
})

// ─── Tests ────────────────────────────────────────────────────────────────────

twoPlayerTest.describe('Two-player lobby', () => {
  twoPlayerTest(
    'player 2 can join a room created by player 1',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 2 must see the same room code
      await expect(pageB.getByTestId('room-code')).toContainText(roomCode, { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'both players see each other in the crew manifest',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      await expect(pageA.getByText('Bob')).toBeVisible({ timeout: 10_000 })
      await expect(pageB.getByText('Alice')).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'player count updates to 2/5 AGENTS on both screens',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      await expect(pageA.getByTestId('player-count')).toHaveText('2/5 AGENTS', { timeout: 10_000 })
      await expect(pageB.getByTestId('player-count')).toHaveText('2/5 AGENTS', { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'Security role is disabled for player 2 after player 1 takes it',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 1 takes Security
      await pageA.getByTestId('security-btn').click()

      // Player 2 should see Security button disabled with ✗
      await expect(pageB.getByTestId('security-btn')).toBeDisabled({ timeout: 10_000 })
      await expect(pageB.getByTestId('security-btn')).toContainText('✗', { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'both players see READY badges after each readies up',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 1 takes Security, player 2 takes Thief — then both ready
      await pageA.getByTestId('security-btn').click()
      await pageB.getByTestId('thief-btn').click()

      await pageA.getByTestId('ready-btn').click()
      await pageB.getByTestId('ready-btn').click()

      // Each player should see two READY badges (use data-testid to avoid matching "CANCEL READY")
      await expect(pageA.getByTestId('ready-badge')).toHaveCount(2, { timeout: 10_000 })
      await expect(pageB.getByTestId('ready-badge')).toHaveCount(2, { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'player 1 leaving updates player 2 to 1/5 AGENTS',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      await expect(pageB.getByText('Alice')).toBeVisible({ timeout: 10_000 })

      // Player 1 disconnects
      await pageA.close()

      await expect(pageB.getByTestId('player-count')).toHaveText('1/5 AGENTS', { timeout: 15_000 })
    },
  )
})
