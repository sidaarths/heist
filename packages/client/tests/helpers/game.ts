/**
 * Shared helpers for Heist E2E tests.
 *
 * All helpers are UI-agnostic: they use data-testid or accessible-role
 * selectors so changes to visual styles don't break the tests.
 */
import { expect, type Page } from '@playwright/test'

/** Navigate to the app root and wait for the HEIST heading. */
export async function goHome(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'HEIST' })).toBeVisible()
}

/**
 * Fill in a callsign, click "HOST A JOB", and wait for the in-room screen.
 * Returns the 6-char room code.
 */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.getByTestId('callsign-input').fill(name)
  await page.getByTestId('host-btn').click()

  // Wait for room code to appear
  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 10_000 })

  const code = (await page.getByTestId('room-code').textContent()) ?? ''
  // room-code div also contains "CLICK TO COPY" — extract the 6-char prefix
  const match = code.match(/[A-Z0-9]{6}/)
  const roomCode = match?.[0] ?? ''
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
  return roomCode
}

/**
 * Fill in a callsign + room code, click "CRACK IN", and wait for the in-room screen.
 */
export async function joinRoom(page: Page, name: string, code: string): Promise<void> {
  await page.getByTestId('callsign-input').fill(name)
  await page.getByTestId('join-btn').click()
  await page.getByTestId('join-code-input').fill(code)
  await page.getByTestId('crack-in-btn').click()

  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 10_000 })
}

/**
 * Select a role and ready up. Waits for the ready button to reflect the new state.
 */
export async function selectRoleAndReady(
  page: Page,
  role: 'security' | 'thief',
): Promise<void> {
  await page.getByTestId(`${role}-btn`).click()
  await page.getByTestId('ready-btn').click()
  // Confirm ready state — button changes to CANCEL READY
  await expect(page.getByTestId('ready-btn')).toContainText('CANCEL READY', { timeout: 5_000 })
}

/**
 * Click the host's LAUNCH HEIST button (only available to host when all conditions met).
 */
export async function launchHeist(hostPage: Page): Promise<void> {
  await expect(hostPage.getByTestId('start-game-btn')).toBeEnabled({ timeout: 10_000 })
  await hostPage.getByTestId('start-game-btn').click()
}
