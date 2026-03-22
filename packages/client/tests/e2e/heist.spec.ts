/**
 * heist.spec.ts — Heist phase E2E tests.
 *
 * Covers:
 *  1. Heist screen renders after planning phase ends (game_start → heist).
 *  2. WASD keys send player_move messages (intercept WS).
 *  3. Security toolbar visible only for Security player.
 *  4. Security action buttons send correct security_action message.
 *  5. Lockdown timer counts down on screen.
 *  6. game_over shows result screen with correct winner.
 *  7. Play again button returns to lobby screen.
 *
 * The planning phase is 60 seconds, so each test that needs to reach the heist
 * screen uses a 120 000ms per-test timeout (passed as the test options object).
 * Result-screen tests wait an additional 90s for lockdown, so they use 180 000ms.
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
// Must be registered BEFORE navigation because the WS connection is opened
// on page load. Register on the page object before calling goHome/createRoom.

function collectWsFrames(page: Page): { frames: string[] } {
  const frames: string[] = []
  page.on('websocket', ws => {
    ws.on('framesent', frame => {
      if (typeof frame.payload === 'string') frames.push(frame.payload)
    })
  })
  return { frames }
}

function parsedFrames(frames: string[]) {
  return frames
    .map(f => { try { return JSON.parse(f) } catch { return null } })
    .filter(Boolean)
}

// ─── Helper: advance both players to the heist phase ────────────────────────
// WS frame collectors must be registered on pages before calling this helper.
// Returns { roomCode } once both pages show [data-testid="heist-canvas"].

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

  // Server auto-transitions planning → heist after 60 seconds.
  await Promise.all([
    expect(pageSec.getByTestId('heist-canvas')).toBeVisible({ timeout: 90_000 }),
    expect(pageThief.getByTestId('heist-canvas')).toBeVisible({ timeout: 90_000 }),
  ])

  return { roomCode }
}

// ─── Heist screen ─────────────────────────────────────────────────────────────

twoPlayerTest.describe('Heist screen', () => {

  twoPlayerTest(
    'heist canvas renders for both players after planning phase ends',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      await expect(pageA.getByTestId('heist-canvas')).toBeVisible()
      await expect(pageB.getByTestId('heist-canvas')).toBeVisible()
    },
  )

  twoPlayerTest(
    'heist screen shows role label in HUD',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      // pageA is Security, pageB is Thief
      await expect(pageA.getByTestId('hud-role')).toContainText('SECURITY', { timeout: 5_000 })
      await expect(pageB.getByTestId('hud-role')).toContainText('THIEF', { timeout: 5_000 })
    },
  )

  twoPlayerTest(
    'WASD keys send player_move messages over WebSocket',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      // Register before navigation
      const { frames: framesB } = collectWsFrames(pageB)

      await startHeistPhase(pageA, pageB)

      // Click to ensure canvas has focus, then press W
      await pageB.getByTestId('heist-canvas').click()
      await pageB.keyboard.press('w')
      await pageB.waitForTimeout(200)

      const moveMsgs = parsedFrames(framesB).filter(m => m?.type === 'player_move')
      expect(moveMsgs.length).toBeGreaterThan(0)
    },
  )

  twoPlayerTest(
    'W key sends player_move with dy=-1',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageB)

      await startHeistPhase(pageA, pageB)

      await pageB.getByTestId('heist-canvas').click()
      await pageB.keyboard.press('w')
      await pageB.waitForTimeout(200)

      const move = parsedFrames(frames).find(m => m?.type === 'player_move' && m.dy === -1)
      expect(move).toBeDefined()
    },
  )

  twoPlayerTest(
    'S key sends player_move with dy=1',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageB)

      await startHeistPhase(pageA, pageB)

      await pageB.getByTestId('heist-canvas').click()
      await pageB.keyboard.press('s')
      await pageB.waitForTimeout(200)

      const move = parsedFrames(frames).find(m => m?.type === 'player_move' && m.dy === 1)
      expect(move).toBeDefined()
    },
  )

  twoPlayerTest(
    'A key sends player_move with dx=-1',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageB)

      await startHeistPhase(pageA, pageB)

      await pageB.getByTestId('heist-canvas').click()
      await pageB.keyboard.press('a')
      await pageB.waitForTimeout(200)

      const move = parsedFrames(frames).find(m => m?.type === 'player_move' && m.dx === -1)
      expect(move).toBeDefined()
    },
  )

  twoPlayerTest(
    'D key sends player_move with dx=1',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageB)

      await startHeistPhase(pageA, pageB)

      await pageB.getByTestId('heist-canvas').click()
      await pageB.keyboard.press('d')
      await pageB.waitForTimeout(200)

      const move = parsedFrames(frames).find(m => m?.type === 'player_move' && m.dx === 1)
      expect(move).toBeDefined()
    },
  )

})

// ─── Security toolbar ─────────────────────────────────────────────────────────

twoPlayerTest.describe('Security toolbar', () => {

  twoPlayerTest(
    'security toolbar is visible to Security player only',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      // pageA = Security → toolbar must appear
      await expect(pageA.getByTestId('security-toolbar')).toBeVisible({ timeout: 5_000 })
      // pageB = Thief → toolbar must NOT appear
      await expect(pageB.getByTestId('security-toolbar')).not.toBeVisible()
    },
  )

  twoPlayerTest(
    'Trigger Alarm button sends security_action trigger_alarm message',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageA)

      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-trigger-alarm').click()
      await pageA.waitForTimeout(200)

      const msg = parsedFrames(frames).find(m => m?.type === 'security_action' && m.action === 'trigger_alarm')
      expect(msg).toBeDefined()
    },
  )

  twoPlayerTest(
    'Cut Lights button sends security_action cut_lights message',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageA)

      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-cut-lights').click()
      await pageA.waitForTimeout(200)

      const msg = parsedFrames(frames).find(m => m?.type === 'security_action' && m.action === 'cut_lights')
      expect(msg).toBeDefined()
    },
  )

  twoPlayerTest(
    'Lock Door button sends security_action lock_door message',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageA)

      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-lock-door').click()
      await pageA.waitForTimeout(200)

      const msg = parsedFrames(frames).find(m => m?.type === 'security_action' && m.action === 'lock_door')
      expect(msg).toBeDefined()
    },
  )

  twoPlayerTest(
    'Release Guard button sends security_action release_guard message',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      const { frames } = collectWsFrames(pageA)

      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-release-guard').click()
      await pageA.waitForTimeout(200)

      const msg = parsedFrames(frames).find(m => m?.type === 'security_action' && m.action === 'release_guard')
      expect(msg).toBeDefined()
    },
  )

})

// ─── Lockdown timer ───────────────────────────────────────────────────────────

twoPlayerTest.describe('Lockdown timer', () => {

  twoPlayerTest(
    'lockdown banner appears after alarm is triggered and counts down',
    { timeout: 120_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      // Security triggers the alarm
      await pageA.getByTestId('btn-trigger-alarm').click()

      // Both players should see the lockdown banner
      await expect(pageA.getByTestId('lockdown-banner')).toBeVisible({ timeout: 5_000 })

      // The banner should contain a countdown number in seconds
      await expect(pageA.getByTestId('lockdown-timer')).toHaveText(/\d+s/, { timeout: 5_000 })

      // Value should decrease within 10 seconds
      const first = (await pageA.getByTestId('lockdown-timer').textContent()) ?? ''
      await expect(pageA.getByTestId('lockdown-timer')).not.toHaveText(first, { timeout: 10_000 })
    },
  )

})

// ─── Result screen ────────────────────────────────────────────────────────────
// These tests are slow: 60s planning + 90s lockdown = ~150s minimum.

twoPlayerTest.describe('Result screen', () => {

  twoPlayerTest(
    'game_over shows result screen with winner text for Security win',
    { timeout: 240_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      // Security triggers alarm — lockdown countdown (90s) begins
      await pageA.getByTestId('btn-trigger-alarm').click()

      // Wait for result screen (server sends game_over at lockdown=0 ~90s after alarm)
      await expect(pageA.getByTestId('result-screen')).toBeVisible({ timeout: 130_000 })
      await expect(pageA.getByTestId('result-winner')).toBeVisible()
    },
  )

  twoPlayerTest(
    'result screen shows Play Again button',
    { timeout: 240_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-trigger-alarm').click()

      await expect(pageA.getByTestId('result-screen')).toBeVisible({ timeout: 130_000 })
      await expect(pageA.getByTestId('play-again-btn')).toBeVisible()
    },
  )

  twoPlayerTest(
    'Play Again button returns both players to lobby screen',
    { timeout: 240_000 },
    async ({ pageA, pageB }) => {
      await startHeistPhase(pageA, pageB)

      await pageA.getByTestId('btn-trigger-alarm').click()

      // Wait for result on both pages
      await Promise.all([
        expect(pageA.getByTestId('result-screen')).toBeVisible({ timeout: 130_000 }),
        expect(pageB.getByTestId('result-screen')).toBeVisible({ timeout: 130_000 }),
      ])

      // Host clicks Play Again
      await pageA.getByTestId('play-again-btn').click()

      // Both players should return to lobby (room-code visible)
      await Promise.all([
        expect(pageA.getByTestId('room-code')).toBeVisible({ timeout: 15_000 }),
        expect(pageB.getByTestId('room-code')).toBeVisible({ timeout: 15_000 }),
      ])
    },
  )

})
