/**
 * lobby.spec.ts — Single-player / home-screen flows.
 *
 * Covers:
 *  1. App loads — title and subtitle visible.
 *  2. Validation — missing callsign shows error for both HOST and JOIN.
 *  3. Validation — short room code shows error.
 *  4. Join panel — expands inline when "JOIN A CREW" is clicked.
 *  5. Create room — transitions to room screen with 6-char code.
 *  6. Role selection — Security / Thief buttons reflect chosen role.
 *  7. Ready flow — READY UP → CANCEL READY → player gets READY badge.
 *  8. Role section hidden once player is ready.
 */

import { test, expect } from '@playwright/test'
import { goHome, createRoom } from '../helpers/game'

// ─── Home screen ──────────────────────────────────────────────────────────────

test.describe('Home screen', () => {
  test('renders HEIST title and subtitle', async ({ page }) => {
    await goHome(page)
    await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible()
    await expect(page.getByText('1v4 ASYMMETRIC MULTIPLAYER')).toBeVisible()
  })

  test('shows callsign input and both action buttons', async ({ page }) => {
    await goHome(page)
    await expect(page.getByTestId('callsign-input')).toBeVisible()
    await expect(page.getByTestId('host-btn')).toBeVisible()
    await expect(page.getByTestId('join-btn')).toBeVisible()
  })

  test('shows error when hosting without a callsign', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('host-btn').click()
    await expect(page.getByText('ENTER YOUR CALLSIGN FIRST.')).toBeVisible()
  })

  test('join panel expands when JOIN A CREW is clicked', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('join-btn').click()
    await expect(page.getByTestId('join-code-input')).toBeVisible()
    await expect(page.getByTestId('crack-in-btn')).toBeVisible()
  })

  test('shows error when joining without a callsign', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('join-btn').click()
    await page.getByTestId('join-code-input').fill('ABCDEF')
    await page.getByTestId('crack-in-btn').click()
    await expect(page.getByText('ENTER YOUR CALLSIGN FIRST.')).toBeVisible()
  })

  test('shows error when room code is fewer than 6 characters', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('callsign-input').fill('Alice')
    await page.getByTestId('join-btn').click()
    await page.getByTestId('join-code-input').fill('ABC')
    await page.getByTestId('crack-in-btn').click()
    await expect(page.getByText('JOB CODE MUST BE 6 CHARACTERS.')).toBeVisible()
  })

  test('join code input auto-uppercases typed characters', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('join-btn').click()
    await page.getByTestId('join-code-input').fill('abcdef')
    await expect(page.getByTestId('join-code-input')).toHaveValue('ABCDEF')
  })

  test('BACK button collapses the join panel', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('join-btn').click()
    await expect(page.getByTestId('join-code-input')).toBeVisible()
    await page.getByRole('button', { name: /BACK/ }).click()
    await expect(page.getByTestId('join-code-input')).not.toBeVisible()
  })

  test('error banner dismisses when ✕ is clicked', async ({ page }) => {
    await goHome(page)
    await page.getByTestId('host-btn').click()
    await expect(page.getByText('ENTER YOUR CALLSIGN FIRST.')).toBeVisible()
    await page.getByRole('button', { name: '✕' }).click()
    await expect(page.getByText('ENTER YOUR CALLSIGN FIRST.')).not.toBeVisible()
  })
})

// ─── Room screen — create flow ─────────────────────────────────────────────────

test.describe('Room screen — create flow', () => {
  test('transitions to room screen with 6-char code after creating a room', async ({ page }) => {
    await goHome(page)
    const code = await createRoom(page, 'Alice')

    await expect(page.getByTestId('room-code')).toBeVisible()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
  })

  test('shows player count as 1/5 AGENTS', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Bob')
    await expect(page.getByTestId('player-count')).toHaveText('1/5 AGENTS')
  })

  test('player appears in crew manifest with [YOU] and [HOST] tags', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Charlie')

    const rows = page.getByTestId('player-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Charlie')
    await expect(rows.first()).toContainText('[YOU]')
    await expect(rows.first()).toContainText('[HOST]')
  })

  test('SECURITY and THIEF role buttons are visible', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Dana')
    await expect(page.getByTestId('security-btn')).toBeVisible()
    await expect(page.getByTestId('thief-btn')).toBeVisible()
  })

  test('READY UP button is disabled before selecting a role', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Eve')
    await expect(page.getByTestId('ready-btn')).toBeDisabled()
  })
})

// ─── Room screen — role & ready flow ──────────────────────────────────────────

test.describe('Room screen — role & ready flow', () => {
  test('selecting SECURITY activates the Security button', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Frank')
    await page.getByTestId('security-btn').click()
    // Selected state: button bg becomes B (#00cfff), text becomes CARD color
    await expect(page.getByTestId('security-btn')).toContainText('SECURITY')
    await expect(page.getByTestId('ready-btn')).toBeEnabled({ timeout: 5_000 })
  })

  test('selecting THIEF activates the Thief button', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Grace')
    await page.getByTestId('thief-btn').click()
    await expect(page.getByTestId('thief-btn')).toContainText('THIEF')
    await expect(page.getByTestId('ready-btn')).toBeEnabled({ timeout: 5_000 })
  })

  test('READY UP enabled after selecting a role', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Hank')
    await page.getByTestId('thief-btn').click()
    await expect(page.getByTestId('ready-btn')).toBeEnabled({ timeout: 5_000 })
  })

  test('clicking READY UP changes label to CANCEL READY', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Iris')
    await page.getByTestId('thief-btn').click()
    await page.getByTestId('ready-btn').click()
    await expect(page.getByTestId('ready-btn')).toContainText('CANCEL READY', { timeout: 5_000 })
  })

  test('clicking CANCEL READY toggles back to READY UP', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Jake')
    await page.getByTestId('thief-btn').click()
    await page.getByTestId('ready-btn').click()
    await expect(page.getByTestId('ready-btn')).toContainText('CANCEL READY', { timeout: 5_000 })
    await page.getByTestId('ready-btn').click()
    await expect(page.getByTestId('ready-btn')).toContainText('READY UP', { timeout: 5_000 })
  })

  test('role selection section is hidden once player is ready', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Karen')
    await page.getByTestId('thief-btn').click()
    await page.getByTestId('ready-btn').click()
    await expect(page.getByText('◈ SELECT ROLE')).not.toBeVisible({ timeout: 5_000 })
  })

  test('READY badge appears in crew manifest after readying up', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Leo')
    await page.getByTestId('thief-btn').click()
    await page.getByTestId('ready-btn').click()
    await expect(page.getByTestId('ready-badge')).toBeVisible({ timeout: 5_000 })
  })

  test('clicking room code shows COPIED feedback', async ({ browser }) => {
    // Grant clipboard permissions so navigator.clipboard.writeText works
    const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    try {
      await goHome(page)
      await createRoom(page, 'Mia')
      await page.getByTestId('room-code').click()
      await expect(page.getByTestId('room-code')).toContainText('COPIED', { timeout: 3_000 })
    } finally {
      await ctx.close()
    }
  })

  test('ABORT MISSION returns to home screen', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Ned')
    await page.getByRole('button', { name: /ABORT MISSION/ }).click()
    await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible({ timeout: 5_000 })
  })

  test('host sees LAUNCH HEIST button, disabled with reason when not enough players', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Oscar')
    // Single player — can never start
    const startBtn = page.getByTestId('start-game-btn')
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toBeDisabled()
    await expect(startBtn).toContainText('NEED')
  })
})
