/**
 * planning.spec.ts — Planning phase flows.
 *
 * Minimum game: 2 players (1 Security + 1 Thief).
 * Most tests use 2 contexts; cross-thief chat tests use 3.
 *
 * Covers:
 *  1. After all players ready → host clicks LAUNCH HEIST → planning screen appears.
 *  2. Planning countdown shows MM:SS and decrements.
 *  3. Thief sees map panel and chat sidebar.
 *  4. Security sees map panel but NO chat sidebar.
 *  5. Thief chat message is visible to the sender.
 *  6. Security does not receive thief chat messages.
 *  7. (3-player) Thief chat appears for all thieves.
 *  8. (3-player) Chat shows sender name prefix.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { goHome, createRoom, joinRoom, launchHeist } from '../helpers/game'

// ─── Two-context fixture (Security + 1 Thief) ─────────────────────────────────

const twoPlayerTest = test.extend<{
  ctxA: BrowserContext
  ctxB: BrowserContext
  pageA: Page
  pageB: Page
}>({
  ctxA: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext(); await use(ctx); await ctx.close()
  },
  ctxB: async ({ browser }: { browser: Browser }, use) => {
    const ctx = await browser.newContext(); await use(ctx); await ctx.close()
  },
  pageA: async ({ ctxA }, use) => { const p = await ctxA.newPage(); await use(p) },
  pageB: async ({ ctxB }, use) => { const p = await ctxB.newPage(); await use(p) },
})

// ─── Three-context fixture (Security + 2 Thieves) ─────────────────────────────

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

// ─── Helper: 2-player planning phase ─────────────────────────────────────────

async function startPlanningPhase2(
  pageSec: Page,
  pageThief: Page,
): Promise<{ roomCode: string }> {
  await goHome(pageSec)
  const roomCode = await createRoom(pageSec, 'Security')

  await goHome(pageThief)
  await joinRoom(pageThief, 'Thief1', roomCode)

  // Assign roles
  await pageSec.getByTestId('security-btn').click()
  await pageThief.getByTestId('thief-btn').click()

  // Both ready up
  await pageSec.getByTestId('ready-btn').click()
  await pageThief.getByTestId('ready-btn').click()

  // Wait for host to see the enabled launch button, then click it
  await launchHeist(pageSec)

  // Both should reach the planning screen
  await Promise.all([
    expect(pageSec.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
    expect(pageThief.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Helper: 3-player planning phase ─────────────────────────────────────────

async function startPlanningPhase3(
  pageSec: Page,
  pageT1: Page,
  pageT2: Page,
): Promise<{ roomCode: string }> {
  await goHome(pageSec)
  const roomCode = await createRoom(pageSec, 'Security')

  await goHome(pageT1)
  await joinRoom(pageT1, 'Thief1', roomCode)

  await goHome(pageT2)
  await joinRoom(pageT2, 'Thief2', roomCode)

  await pageSec.getByTestId('security-btn').click()
  await pageT1.getByTestId('thief-btn').click()
  await pageT2.getByTestId('thief-btn').click()

  await pageSec.getByTestId('ready-btn').click()
  await pageT1.getByTestId('ready-btn').click()
  await pageT2.getByTestId('ready-btn').click()

  await launchHeist(pageSec)

  await Promise.all([
    expect(pageSec.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
    expect(pageT1.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
    expect(pageT2.getByTestId('planning-countdown')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

twoPlayerTest.describe('Planning phase', () => {
  twoPlayerTest(
    'both players transition to planning screen after host launches',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      await expect(pageA.getByTestId('planning-countdown')).toBeVisible()
      await expect(pageB.getByTestId('planning-countdown')).toBeVisible()
    },
  )

  twoPlayerTest(
    'planning countdown shows a time value and decrements',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      const countdown = pageA.getByTestId('planning-countdown')

      // Must show MM:SS format — e.g. "1:00" or "0:59"
      await expect(countdown).toHaveText(/^\d+:\d{2}$/, { timeout: 5_000 })

      // Read the first value and wait for it to decrement
      const first = (await countdown.textContent()) ?? ''
      await expect(countdown).not.toHaveText(first, { timeout: 3_000 })
    },
  )

  twoPlayerTest(
    'planning screen header shows PLANNING PHASE label',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      await expect(pageA.getByText('PLANNING PHASE')).toBeVisible()
      await expect(pageB.getByText('PLANNING PHASE')).toBeVisible()
    },
  )

  twoPlayerTest(
    'thief sees the chat sidebar; security does not',
    async ({ pageA, pageB }) => {
      // pageA = Security, pageB = Thief
      await startPlanningPhase2(pageA, pageB)

      await expect(pageB.getByTestId('chat-panel')).toBeVisible()
      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
    },
  )

  twoPlayerTest(
    'thief sees MAP CLASSIFIED overlay; security does not',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      await expect(pageB.getByText('MAP CLASSIFIED')).toBeVisible()
      await expect(pageA.getByText('MAP CLASSIFIED')).not.toBeVisible()
    },
  )

  twoPlayerTest(
    'thief chat message is visible in their own panel',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      await pageB.getByTestId('chat-input').fill('vault is on the right')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageB.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
    },
  )

  twoPlayerTest(
    'security does not see thief chat messages',
    async ({ pageA, pageB }) => {
      await startPlanningPhase2(pageA, pageB)

      await pageB.getByTestId('chat-input').fill('secret plan alpha')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageB.getByTestId('chat-messages')).toContainText('secret plan alpha', { timeout: 5_000 })

      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
      await expect(pageA.getByText('secret plan alpha')).not.toBeVisible()
    },
  )
})

// ─── Cross-thief chat (needs 3 players) ───────────────────────────────────────

threePlayerTest.describe('Planning phase — cross-thief chat', () => {
  threePlayerTest(
    'thief chat message appears for all thieves',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase3(pageA, pageB, pageC)

      // pageB (Thief1) sends a message
      await pageB.getByTestId('chat-input').fill('vault is on the right')
      await pageB.getByTestId('chat-input').press('Enter')

      // Both thieves should see the message
      await expect(pageB.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
    },
  )

  threePlayerTest(
    'thief chat shows sender name prefix',
    async ({ pageA, pageB, pageC }) => {
      await startPlanningPhase3(pageA, pageB, pageC)

      await pageB.getByTestId('chat-input').fill('hello crew')
      await pageB.getByTestId('chat-input').press('Enter')

      // Thief2 should see Thief1's name prefix
      await expect(pageC.getByTestId('chat-messages')).toContainText('Thief1', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('hello crew', { timeout: 5_000 })
    },
  )
})
