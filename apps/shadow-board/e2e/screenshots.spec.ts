/**
 * Capture the 6 high-signal redesign screenshots:
 * SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
import { test } from '@playwright/test';
import { openApp } from '@x10/shared/e2e';

const ADMIN = 'Alex Rivera';

test.describe('screenshots', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to capture screenshots.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('desktop-light-stage', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/desktop-light-stage.png' });
  });

  test('desktop-dark-stage', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, '/', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/desktop-dark-stage.png' });
  });

  test('desktop-lens', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Condition/ }).click();
    await page.getByTestId('board-slot-LP-01').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/desktop-lens.png' });
  });

  test('desktop-tool', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/reserve', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/desktop-tool.png' });
  });

  test('phone-light-stage', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/phone-light-stage.png' });
  });

  test('phone-dark-stage', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, '/', ADMIN);
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/redesign/phone-dark-stage.png' });
  });
});
