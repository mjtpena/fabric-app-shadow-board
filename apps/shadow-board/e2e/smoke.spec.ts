import { expect, test } from '@playwright/test';
import { openApp } from '@x10/shared/e2e';

const ADMIN = 'Alex Rivera';
const BORROWER = 'Sam Taylor';

test('smoke: board renders with no console errors, lenses & list view work', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await openApp(page, '/', ADMIN);
  await expect(page.getByRole('img', { name: /Shadow board pegboard/ })).toBeVisible();

  // Switch lens
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Overdue/ }).click();
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Availability/ }).click();

  // Switch to list view
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('asset-list-table')).toBeVisible();
  expect(errors).toEqual([]);
});

test('AC1: reservation overlapping another loan return buffer is refused with next free date', async ({ page }) => {
  await openApp(page, '/reserve', BORROWER);
  // Select LP-02 which is currently in reimaging buffer
  await page.getByLabel('Asset assignment').selectOption({ label: 'LP-02 — Surface Laptop 6 (New)' });
  // Set start date to today so it overlaps the buffer
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Start date').fill(today);
  await page.getByLabel('Due date').fill(tomorrow);
  await page.getByRole('button', { name: 'Confirm reservation' }).click();

  await expect(page.getByText(/Next free date:/i)).toBeVisible();
});

test('AC3: return missing charger sends laptop to repair and removes from availability', async ({ page }) => {
  await openApp(page, '/desk', ADMIN);
  await page.getByRole('button', { name: 'Check in LP-04' }).click();
  await page.getByLabel('USB-C charger').uncheck();
  await page.getByRole('button', { name: 'Complete check-in' }).click();

  await expect(page.getByText(/LP-04 sent to repair/i)).toBeVisible();

  // Verify on board that LP-04 is now in repair
  await page.goto('/#/');
  await expect(page.getByTestId('board-slot-LP-04')).toHaveAttribute('data-status', 'repair');
});

test('AC4: dragging date slider forward fills empty outline when loan buffer ends', async ({ page }) => {
  await openApp(page, '/', ADMIN);
  // LP-02 is reimaging today (day 0)
  await expect(page.getByTestId('board-slot-LP-02')).toHaveAttribute('data-status', 'reimaging');

  // Move slider forward by 7 days (well past 2-business-day buffer)
  await page.getByTestId('date-slider').fill('7');
  await expect(page.getByTestId('board-slot-LP-02')).toHaveAttribute('data-status', 'in');
});

test('AC5: board and table agree on in, out, overdue and repair for selected date', async ({ page }) => {
  await openApp(page, '/', ADMIN);

  const sampleTags = ['LP-01', 'LP-02', 'LP-04', 'LP-13', 'LP-14'];
  const boardStatuses: Record<string, string | null> = {};
  for (const tag of sampleTags) {
    boardStatuses[tag] = await page.getByTestId(`board-slot-${tag}`).getAttribute('data-status');
  }

  await page.getByRole('radio', { name: 'List' }).click();
  for (const tag of sampleTags) {
    await expect(page.getByTestId(`list-row-${tag}`)).toHaveAttribute('data-status', boardStatuses[tag]!);
  }
});
