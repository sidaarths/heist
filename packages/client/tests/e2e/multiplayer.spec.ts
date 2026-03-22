/**
 * multiplayer.spec.ts — Two-player room join flow.
 *
 * Uses two independent browser contexts (each with its own WebSocket
 * connection) to exercise the full join flow:
 *
 *  1. Player 1 creates a room and reads the room code.
 *  2. Player 2 navigates to the home screen in a separate context.
 *  3. Player 2 joins with the code from step 1.
 *  4. Both players now see each other in the player list.
 *  5. Each player selects a different role and readies up.
 *  6. Both players see the other's ready badge.
 *
 * Because two contexts are used, each test explicitly opens pages rather
 * than relying on the default `page` fixture.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function goHome(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible()
}

/**
 * Enter name, click "Create Room", wait for the room screen, and return the
 * 6-character room code.
 */
async function createRoom(page: Page, name: string): Promise<string> {
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: 'Create Room' }).click()

  await expect(page.getByText('ROOM CODE')).toBeVisible({ timeout: 10_000 })

  // The room code is a 6-char uppercase alphanumeric string in a large monospace div.
  const codeLocator = page.locator('div').filter({ hasText: /^[A-Z0-9]{6}$/ }).first()
  await expect(codeLocator).toBeVisible({ timeout: 10_000 })
  const code = (await codeLocator.textContent())?.trim() ?? ''
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  return code
}

/**
 * Enter name + room code, click "Join Room", wait for the room screen.
 */
async function joinRoom(page: Page, name: string, code: string): Promise<void> {
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByPlaceholder('ROOM CODE').fill(code)
  await page.getByRole('button', { name: 'Join Room' }).click()

  await expect(page.getByText('ROOM CODE')).toBeVisible({ timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Two-context fixture
// ---------------------------------------------------------------------------

/**
 * Extend the base test with two independent browser contexts so each player
 * gets isolated storage and a distinct WebSocket connection.
 */
const twoPlayerTest = test.extend<{
  ctxA: BrowserContext
  ctxB: BrowserContext
  pageA: Page
  pageB: Page
}>({
  // eslint-disable-next-line no-empty-pattern
  ctxA: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext()
    await use(ctx)
    await ctx.close()
  },
  // eslint-disable-next-line no-empty-pattern
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

twoPlayerTest.describe('Two-player lobby', () => {
  twoPlayerTest(
    'player 2 can join a room created by player 1',
    async ({ pageA, pageB }) => {
      // -- Player 1 creates the room --
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      // -- Player 2 joins with that code --
      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 2 must see the same room code on their screen.
      const codeLocatorB = pageB.locator('div').filter({ hasText: /^[A-Z0-9]{6}$/ }).first()
      await expect(codeLocatorB).toHaveText(roomCode, { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'both players see each other in the player list',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 1 should see "Bob" appear in their list.
      await expect(pageA.getByText('Bob')).toBeVisible({ timeout: 10_000 })

      // Player 2 should see "Alice" in their list.
      await expect(pageB.getByText('Alice')).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'player count updates to 2/5 after the second player joins',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Both views should reflect the updated count.
      await expect(pageA.getByText(/2\/5 players/)).toBeVisible({ timeout: 10_000 })
      await expect(pageB.getByText(/2\/5 players/)).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'Security role is marked as taken for player 2 after player 1 takes it',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 1 takes Security.
      await pageA.getByRole('button', { name: /Security/ }).click()

      // Player 2 must see the button marked as "(taken)" and disabled.
      const secBtnB = pageB.getByRole('button', { name: /Security.*taken/ })
      await expect(secBtnB).toBeVisible({ timeout: 10_000 })
      await expect(secBtnB).toBeDisabled()
    },
  )

  twoPlayerTest(
    'both players see the ready badge after each readies up',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Player 1 picks Security, player 2 picks Thief.
      await pageA.getByRole('button', { name: /Security/ }).click()
      await pageB.getByRole('button', { name: 'Thief' }).click()

      // Both ready up.
      await pageA.getByRole('button', { name: 'Ready Up' }).click()
      await pageB.getByRole('button', { name: 'Ready Up' }).click()

      // Each player should see two "ready" badges — one for each player.
      await expect(pageA.getByText('ready')).toHaveCount(2, { timeout: 10_000 })
      await expect(pageB.getByText('ready')).toHaveCount(2, { timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'player 1 leaves and player 2 sees the updated player list',
    async ({ pageA, pageB }) => {
      await goHome(pageA)
      const roomCode = await createRoom(pageA, 'Alice')

      await goHome(pageB)
      await joinRoom(pageB, 'Bob', roomCode)

      // Confirm both players are present.
      await expect(pageB.getByText('Alice')).toBeVisible({ timeout: 10_000 })

      // Player 1 closes / navigates away (simulates a disconnect).
      await pageA.close()

      // Player 2 should eventually see only 1 player or a "disconnected" badge.
      // The server emits player_left which removes the player from the list.
      await expect(pageB.getByText(/1\/5 players/)).toBeVisible({ timeout: 15_000 })
    },
  )
})
