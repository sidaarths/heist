/**
 * heist-chat.spec.ts — Heist-phase chat and timer tests.
 *
 * Planning phase has been removed — the game starts immediately after
 * LAUNCH HEIST is clicked. These tests verify:
 *
 *  1. Thief sees the chat sidebar in the heist screen.
 *  2. Security does NOT see the chat sidebar.
 *  3. Heist timer displays MM:SS format.
 *  4. Heist timer decrements.
 *  5. Thief chat message is visible in their own panel.
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

// ─── Helper: 2-player heist phase ─────────────────────────────────────────────

async function startHeist2(
  pageSec: Page,
  pageThief: Page,
): Promise<{ roomCode: string }> {
  await goHome(pageSec)
  const roomCode = await createRoom(pageSec, 'Security')

  await goHome(pageThief)
  await joinRoom(pageThief, 'Thief1', roomCode)

  await pageSec.getByTestId('security-btn').click()
  await pageThief.getByTestId('thief-btn').click()

  await pageSec.getByTestId('ready-btn').click()
  await pageThief.getByTestId('ready-btn').click()

  await launchHeist(pageSec)

  // No planning phase — heist canvas should appear almost immediately
  await Promise.all([
    expect(pageSec.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
    expect(pageThief.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Helper: 3-player heist phase ─────────────────────────────────────────────

async function startHeist3(
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
    expect(pageSec.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
    expect(pageT1.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
    expect(pageT2.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

twoPlayerTest.describe('Heist phase — chat and timer', () => {
  twoPlayerTest(
    'game starts immediately — no planning screen',
    { timeout: 30_000 },
    async ({ pageA, pageB }) => {
      await startHeist2(pageA, pageB)

      // Heist canvas must be visible for both players
      await expect(pageA.getByTestId('heist-canvas')).toBeVisible()
      await expect(pageB.getByTestId('heist-canvas')).toBeVisible()
    },
  )

  twoPlayerTest(
    'heist timer shows MM:SS format and decrements',
    { timeout: 30_000 },
    async ({ pageA, pageB }) => {
      await startHeist2(pageA, pageB)

      const timer = pageA.getByTestId('heist-timer')
      await expect(timer).toBeVisible({ timeout: 5_000 })

      // Must show MM:SS format — e.g. "5:00" or "4:59"
      await expect(timer).toHaveText(/^\d+:\d{2}$/, { timeout: 5_000 })

      // Read and wait for it to decrement
      const first = (await timer.textContent()) ?? ''
      await expect(timer).not.toHaveText(first, { timeout: 5_000 })
    },
  )

  twoPlayerTest(
    'thief sees chat sidebar during heist; security does not',
    { timeout: 30_000 },
    async ({ pageA, pageB }) => {
      // pageA = Security, pageB = Thief
      await startHeist2(pageA, pageB)

      await expect(pageB.getByTestId('chat-panel')).toBeVisible({ timeout: 5_000 })
      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
    },
  )

  twoPlayerTest(
    'thief chat message is visible in their own panel',
    { timeout: 30_000 },
    async ({ pageA, pageB }) => {
      await startHeist2(pageA, pageB)

      await pageB.getByTestId('chat-input').fill('vault is on the right')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageB.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
    },
  )

  twoPlayerTest(
    'security does not see thief chat messages',
    { timeout: 30_000 },
    async ({ pageA, pageB }) => {
      await startHeist2(pageA, pageB)

      await pageB.getByTestId('chat-input').fill('secret plan alpha')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageB.getByTestId('chat-messages')).toContainText('secret plan alpha', { timeout: 5_000 })

      // Security has no chat panel at all
      await expect(pageA.getByTestId('chat-panel')).not.toBeVisible()
      await expect(pageA.getByText('secret plan alpha')).not.toBeVisible()
    },
  )
})

// ─── Cross-thief chat (needs 3 players) ───────────────────────────────────────

threePlayerTest.describe('Heist phase — cross-thief chat', () => {
  threePlayerTest(
    'thief chat message appears for all thieves',
    { timeout: 30_000 },
    async ({ pageA, pageB, pageC }) => {
      await startHeist3(pageA, pageB, pageC)

      await pageB.getByTestId('chat-input').fill('vault is on the right')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageB.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('vault is on the right', { timeout: 5_000 })
    },
  )

  threePlayerTest(
    'thief chat shows sender name prefix',
    { timeout: 30_000 },
    async ({ pageA, pageB, pageC }) => {
      await startHeist3(pageA, pageB, pageC)

      await pageB.getByTestId('chat-input').fill('hello crew')
      await pageB.getByTestId('chat-input').press('Enter')

      await expect(pageC.getByTestId('chat-messages')).toContainText('Thief1', { timeout: 5_000 })
      await expect(pageC.getByTestId('chat-messages')).toContainText('hello crew', { timeout: 5_000 })
    },
  )
})
