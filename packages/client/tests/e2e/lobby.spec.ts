/**
 * lobby.spec.ts — Single-player / home-screen flows.
 *
 * These tests cover:
 *  1. App loads and the "HEIST" title is visible.
 *  2. Validation: clicking "Create Room" without a name shows an error.
 *  3. Validation: clicking "Join Room" with a short room code shows an error.
 *  4. Creating a room: entering a name and clicking "Create Room" transitions
 *     to the room screen and displays a 6-character room code.
 *  5. Role selection: after entering a room, clicking "Security" highlights the
 *     button (blue border / text).
 *  6. Ready up: selecting a role and clicking "Ready Up" flips the button label
 *     to "Not Ready".
 *
 * All tests require the Vite dev server AND the Bun WS server to be running
 * (the playwright.config.ts webServer array takes care of both).
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the app root and wait for the HEIST heading. */
async function goHome(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible()
}

/**
 * Fill in a player name, click "Create Room", and wait until the room screen
 * is visible (the "ROOM CODE" label appears).
 */
async function createRoom(page: Page, name: string): Promise<string> {
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: 'Create Room' }).click()

  // Wait for the room screen — the label "ROOM CODE" must appear.
  const roomCodeLabel = page.getByText('ROOM CODE')
  await expect(roomCodeLabel).toBeVisible({ timeout: 10_000 })

  // The room code is rendered in a monospace div immediately below the label.
  // It is the only text node that is exactly 6 uppercase letters/digits.
  const codeLocator = page.locator('div').filter({ hasText: /^[A-Z0-9]{6}$/ }).first()
  const code = (await codeLocator.textContent())?.trim() ?? ''
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  return code
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Home screen', () => {
  test('renders the HEIST title and subtitle', async ({ page }) => {
    await goHome(page)

    await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible()
    await expect(page.getByText('A 1v4 asymmetric multiplayer game')).toBeVisible()
  })

  test('shows name input and both action buttons', async ({ page }) => {
    await goHome(page)

    await expect(page.getByPlaceholder('Your name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible()
    await expect(page.getByPlaceholder('ROOM CODE')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Join Room' })).toBeVisible()
  })

  test('shows an error when creating a room without a name', async ({ page }) => {
    await goHome(page)

    await page.getByRole('button', { name: 'Create Room' }).click()

    await expect(page.getByText('Enter your name first.')).toBeVisible()
  })

  test('shows an error when joining a room without a name', async ({ page }) => {
    await goHome(page)

    await page.getByRole('button', { name: 'Join Room' }).click()

    await expect(page.getByText('Enter your name first.')).toBeVisible()
  })

  test('shows an error when room code is fewer than 6 characters', async ({ page }) => {
    await goHome(page)

    await page.getByPlaceholder('Your name').fill('Alice')
    await page.getByPlaceholder('ROOM CODE').fill('ABC')
    await page.getByRole('button', { name: 'Join Room' }).click()

    await expect(page.getByText('Room code must be 6 characters.')).toBeVisible()
  })

  test('uppercases the room code as the user types', async ({ page }) => {
    await goHome(page)

    const codeInput = page.getByPlaceholder('ROOM CODE')
    await codeInput.fill('abcdef')

    // The input handler calls .toUpperCase() on each keystroke.
    await expect(codeInput).toHaveValue('ABCDEF')
  })

  test('dismisses the error banner when the close button is clicked', async ({ page }) => {
    await goHome(page)

    await page.getByRole('button', { name: 'Create Room' }).click()
    const error = page.getByText('Enter your name first.')
    await expect(error).toBeVisible()

    // The dismiss button is a ✕ rendered as a float:right child of the error div.
    await page.getByRole('button', { name: '✕' }).click()
    await expect(error).not.toBeVisible()
  })
})

test.describe('Room screen — create flow', () => {
  test('transitions to the room screen after creating a room', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Alice')

    // "ROOM CODE" label and the player counter must be visible.
    await expect(page.getByText('ROOM CODE')).toBeVisible()
    await expect(page.getByText(/1\/5 players/)).toBeVisible()
  })

  test('room code is 6 uppercase alphanumeric characters', async ({ page }) => {
    await goHome(page)
    const code = await createRoom(page, 'Bob')

    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
  })

  test('player appears in the players list with their chosen name', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Charlie')

    // The player name should appear in the list, tagged with "(you)".
    await expect(page.getByText('Charlie')).toBeVisible()
    await expect(page.getByText('(you)')).toBeVisible()
    // The host is also the player, so "(host)" should appear.
    await expect(page.getByText('(host)')).toBeVisible()
  })

  test('role selection buttons are visible on the room screen', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Dana')

    await expect(page.getByRole('button', { name: /Security/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thief' })).toBeVisible()
  })

  test('Ready Up button is disabled before a role is selected', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Eve')

    const readyBtn = page.getByRole('button', { name: 'Ready Up' })
    await expect(readyBtn).toBeVisible()
    await expect(readyBtn).toBeDisabled()
  })
})

test.describe('Room screen — role & ready flow', () => {
  test('selecting the Security role highlights the Security button', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Frank')

    const securityBtn = page.getByRole('button', { name: /Security/ })
    await securityBtn.click()

    // After selection the button gets color:#60a5fa (blue).  The most reliable
    // assertion without data-testid is to check the inline color style.
    await expect(securityBtn).toHaveCSS('color', 'rgb(96, 165, 250)')
  })

  test('selecting the Thief role highlights the Thief button', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Grace')

    const thiefBtn = page.getByRole('button', { name: 'Thief' })
    await thiefBtn.click()

    // After selection the button gets color:#c084fc (purple).
    await expect(thiefBtn).toHaveCSS('color', 'rgb(192, 132, 252)')
  })

  test('Ready Up button is enabled after selecting a role', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Hank')

    await page.getByRole('button', { name: 'Thief' }).click()

    const readyBtn = page.getByRole('button', { name: 'Ready Up' })
    await expect(readyBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('clicking Ready Up changes the button to "Not Ready"', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Iris')

    // Select a role first so Ready Up is enabled.
    await page.getByRole('button', { name: 'Thief' }).click()

    const readyBtn = page.getByRole('button', { name: 'Ready Up' })
    await expect(readyBtn).toBeEnabled({ timeout: 5_000 })
    await readyBtn.click()

    // After toggling ready, the button label flips.
    await expect(page.getByRole('button', { name: 'Not Ready' })).toBeVisible({ timeout: 5_000 })
  })

  test('clicking Not Ready toggles back to Ready Up', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Jake')

    await page.getByRole('button', { name: 'Thief' }).click()
    await page.getByRole('button', { name: 'Ready Up' }).click()
    await expect(page.getByRole('button', { name: 'Not Ready' })).toBeVisible({ timeout: 5_000 })

    // Toggle back.
    await page.getByRole('button', { name: 'Not Ready' }).click()
    await expect(page.getByRole('button', { name: 'Ready Up' })).toBeVisible({ timeout: 5_000 })
  })

  test('role selection buttons are hidden once the player is ready', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Karen')

    await page.getByRole('button', { name: 'Thief' }).click()
    await page.getByRole('button', { name: 'Ready Up' }).click()

    // The "SELECT ROLE" section is conditionally rendered only when !me?.ready.
    await expect(page.getByText('SELECT ROLE')).not.toBeVisible({ timeout: 5_000 })
  })

  test('player list shows "ready" badge after readying up', async ({ page }) => {
    await goHome(page)
    await createRoom(page, 'Leo')

    await page.getByRole('button', { name: 'Thief' }).click()
    await page.getByRole('button', { name: 'Ready Up' }).click()

    // The "ready" badge is rendered as a <span> inside the player list item.
    await expect(page.getByText('ready')).toBeVisible({ timeout: 5_000 })
  })
})
