/**
 * planning.spec.ts — Planning phase flows.
 *
 * Requires 3 players (minimum for game start): 1 Security + 2 Thieves.
 * Uses three independent browser contexts.
 *
 * Covers:
 *  1. After all players ready → planning screen appears on all screens.
 *  2. Planning countdown starts at 60 and decrements.
 *  3. Thieves see the map panel and chat sidebar.
 *  4. Security sees the map panel but NO chat sidebar.
 *  5. Thief chat message appears for all thieves.
 *  6. Security does not receive thief chat messages.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { goHome, createRoom, joinRoom, selectRoleAndReady } from '../helpers/game'

// ─── Three-context fixture ────────────────────────────────────────────────────

const threePlayerTest = test.extend<{
  ctxA: BrowserContext
  ctxB: BrowserContext
  ctxC: BrowserContext
  pageA: Page
  pageB: Page
  pageC: Page
}>({
  ctxA: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext(); await use(ctx); await ctx.close()
  },
  ctxB: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext(); await use(ctx); await ctx.close()
  },
  ctxC: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext(); await use(ctx); await ctx.close()
  },
  pageA: async ({ ctxA }, use) => { const p = await ctxA.newPage(); await use(p) },
  pageB: async ({ ctxB }, use) => { const p = await ctxB.newPage(); await use(p) },
  pageC: async ({ ctxC }, use) => { const p = await ctxC.newPage(); await use(p) },
})

/**
 * Helper: boot a 3-player game (Security + 2 Thieves) and wait for the planning
 * screen to appear on all three pages.
 *
 * Returns { roomCode, pageSecurity, pageThief1, pageThief2 }.
 */
async function startPlanningPhase(
  pageSec: Page,
  pageT1: Page,
  pageT2: Page,
): Promise<{ roomCode: string }> {
  // Player A creates the room (Security)
  await goHome(pageSec)
  const roomCode = await createRoom(pageSec, 'Security')

  // Players B and C join
  await goHome(pageT1)
  await joinRoom(pageT1, 'Thief1', roomCode)

  await goHome(pageT2)
  await joinRoom(pageT2, 'Thief2', roomCode)

  // Assign roles
  await pageSec.getByTestId('security-btn').click()
  await pageT1.getByTestId('thief-btn').click()
  await pageT2.getByTestId('thief-btn').click()

  // All ready up
  await pageSec.getByTestId('ready-btn').click()
  await pageT1.getByTestId('ready-btn').click()
  await pageT2.getByTestId('ready-btn').click()

  // All three should reach the planning screen
  await Promise.all([
    expect(pageSec.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
    expect(pageT1.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
    expect(pageT2.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

threePlayerTest.describe('Planning phase', () => {
  threePlayerTest(
    'all players transition to planning screen when everyone readies up',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      // All three must show the planning countdown
      await expect(pageA.getByTestId('planning-countdown')).toBeVisible()
      await expect(pageB.getByTestId('planning-countdown')).toBeVisible()
      await expect(pageC.getByTestId('planning-countdown')).toBeVisible()
    },
  )

  threePlayerTest(
    'planning countdown shows a time value and decrements',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      const countdown = pageA.getByTestId('planning-countdown')

      // Must show MM:SS format — e.g. "1:00" or "0:59"
      await expect(countdown).toHaveText(/^\d+:\d{2}$/, { timeout: 5_000 })

      // Read the first value and wait for it to decrement
      const first = (await countdown.textContent()) ?? ''
      await expect(countdown).not.toHaveText(first, { timeout: 3_000 })
    },
  )

  threePlayerTest(
    'planning screen header shows PLANNING PHASE label',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      // All three should see the planning phase header
      await expect(pageA.getByText('PLANNING PHASE')).toBeVisible()
      await expect(pageB.getByText('PLANNING PHASE')).toBeVisible()
      await expect(pageC.getByText('PLANNING PHASE')).toBeVisible()
    },
  )

  threePlayerTest(
    'thieves see the chat sidebar; security does not',
    async ({ pageA, pageB, pageC }) => {
      // pageA = Security, pageB/pageC = Thieves
      await startPlanningPhase(pageA, pageB, pageC)

      // Thieves must have chat panel
      await expect(pageB.getByTestId('chat-panel')).toBeVisible()
      await expect(pageC.getByTestId('chat-panel')).toBeVisible()

      // Security must NOT have chat panel
      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
    },
  )

  threePlayerTest(
    'thieves see MAP CLASSIFIED overlay on blurred map',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      // Thieves see the classified overlay
      await expect(pageB.getByText('MAP CLASSIFIED')).toBeVisible()
      await expect(pageC.getByText('MAP CLASSIFIED')).toBeVisible()

      // Security does not see the classified overlay
      await expect(pageA.getByText('MAP CLASSIFIED')).not.toBeVisible()
    },
  )

  threePlayerTest(
    'thief chat message appears for all thieves',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      // pageB (Thief1) sends a message
      await pageB.getByTestId('chat-input').fill('vault is on the right')
      await pageB.getByTestId('chat-input').press('Enter')

      // Both thieves should see the message
      await expect(pageB.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
    },
  )

  threePlayerTest(
    'security does not see thief chat messages',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      // Thief sends a message
      await pageB.getByTestId('chat-input').fill('secret plan alpha')
      await pageB.getByTestId('chat-input').press('Enter')

      // Give time for the message to be delivered
      await expect(pageB.getByTestId('chat-messages')).toContainText('secret plan alpha', { timeout: 5_000 })

      // Security page should have no chat-messages element visible
      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
      // If somehow it were present, it should not contain the message
      const securityPage = pageA
      const chatOnSecurity = securityPage.getByText('secret plan alpha')
      await expect(chatOnSecurity).not.toBeVisible()
    },
  )

  threePlayerTest(
    'thief chat shows sender name prefix',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase(pageA, pageB, pageC)

      await pageB.getByTestId('chat-input').fill('hello crew')
      await pageB.getByTestId('chat-input').press('Enter')

      // Message in Thief2's chat should include the sender name "Thief1"
      await expect(pageC.getByTestId('chat-messages')).toContainText('Thief1', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('hello crew', { timeout: 5_000 })
    },
  )
})
