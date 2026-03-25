/**
 * resolution.spec.ts — Phase 4 Resolution & Replay E2E tests.
 *
 * Covers:
 *  1. "Watch Replay" button is visible on the result screen
 *  2. clicking "Watch Replay" sends request_replay message over WebSocket
 *  3. replay canvas renders after replay_data is received
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { goHome, createRoom, joinRoom, launchHeist } from '../helpers/game'

// ─── Two-context fixture (Security + 1 Thief) ────────────────────────────────

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

// ─── WS frame collector ───────────────────────────────────────────────────────

function collectWsFrames(page: Page): { sent: string[]; received: string[] } {
  const sent: string[] = []
  const received: string[] = []
  page.on('websocket', ws => {
    ws.on('framesent', frame => {
      if (typeof frame.payload === 'string') sent.push(frame.payload)
    })
    ws.on('framereceived', frame => {
      if (typeof frame.payload === 'string') received.push(frame.payload)
    })
  })
  return { sent, received }
}

function parsedFrames(frames: string[]) {
  return frames
    .map(f => { try { return JSON.parse(f) } catch { return null } })
    .filter(Boolean)
}

// ─── Helper: advance both players to the heist phase ────────────────────────

async function startHeistPhase(
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

  await Promise.all([
    expect(pageSec.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
    expect(pageThief.getByTestId('heist-canvas')).toBeVisible({ timeout: 15_000 }),
  ])

  return { roomCode }
}

// ─── Helper: reach result screen by triggering alarm and waiting for timer ───

async function reachResultScreen(pageSec: Page, pageThief: Page): Promise<void> {
  await startHeistPhase(pageSec, pageThief)

  // Trigger alarm — heist timer caps to 60s (ALARM_LOCKDOWN_TICKS = 1200 @ 20tps)
  await pageSec.getByTestId('btn-trigger-alarm').click()

  // Wait for result screen (~60s for timer to expire)
  await expect(pageSec.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 })
}

// ─── Resolution screen ────────────────────────────────────────────────────────

twoPlayerTest.describe('Resolution screen — Watch Replay button', () => {

  twoPlayerTest(
    '"Watch Replay" button is visible on the result screen',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await reachResultScreen(pageA, pageB)

      await expect(pageA.getByTestId('watch-replay-btn')).toBeVisible({ timeout: 5_000 })
    },
  )

  twoPlayerTest(
    'clicking "Watch Replay" sends request_replay message over WebSocket',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      // Register WS collector BEFORE navigation
      const { sent } = collectWsFrames(pageA)

      await reachResultScreen(pageA, pageB)

      await pageA.getByTestId('watch-replay-btn').click()

      // Wait briefly for the message to be sent
      await pageA.waitForTimeout(500)

      const replayRequests = parsedFrames(sent).filter(
        m => m?.type === 'request_replay',
      )
      expect(replayRequests.length).toBeGreaterThan(0)
    },
  )

})

// ─── Replay screen ────────────────────────────────────────────────────────────

twoPlayerTest.describe('Replay screen', () => {

  twoPlayerTest(
    'replay canvas renders after replay_data is received',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await reachResultScreen(pageA, pageB)

      await pageA.getByTestId('watch-replay-btn').click()

      // After clicking Watch Replay, the replay screen should appear
      await expect(pageA.getByTestId('replay-canvas')).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'replay screen shows scrubber bar',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await reachResultScreen(pageA, pageB)

      await pageA.getByTestId('watch-replay-btn').click()

      await expect(pageA.getByTestId('replay-scrubber')).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'replay screen shows play/pause button',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await reachResultScreen(pageA, pageB)

      await pageA.getByTestId('watch-replay-btn').click()

      await expect(pageA.getByTestId('replay-play-btn')).toBeVisible({ timeout: 10_000 })
    },
  )

  twoPlayerTest(
    'replay screen shows speed toggle button',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await reachResultScreen(pageA, pageB)

      await pageA.getByTestId('watch-replay-btn').click()

      await expect(pageA.getByTestId('replay-speed-btn')).toBeVisible({ timeout: 10_000 })
    },
  )

})
