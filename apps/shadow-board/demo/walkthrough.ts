import type { DemoScript } from '@x10/shared/demo';

export const script: DemoScript = {
  appId: 'shadow-board',
  title: 'Shadow Board — Hardware Loaner Pool',
  scenes: [
    {
      name: 'Board overview',
      say: 'Holiday travel empties the IT loaner cupboard, and spreadsheets never show which laptops are still waiting to be reimaged.',
      run: async ({ page }) => {
        await page.goto('/');
        await page.getByRole('img', { name: /Shadow board pegboard/ }).waitFor();
      },
    },
    {
      name: 'Metaphor explained',
      say: 'Shadow Board lays out all thirty-six loaner devices on a workshop pegboard. Solid silhouettes are in; empty outlines hang a linen tag with initials and due date.',
      run: async ({ page }) => {
        await page.getByTestId('board-slot-LP-01').click();
      },
    },
    {
      name: 'Lens switch',
      say: 'Switch to the Overdue lens to isolate late returns immediately, or press four to inspect hardware condition across the pool.',
      run: async ({ page }) => {
        await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Overdue/ }).click();
        await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Availability/ }).click();
      },
    },
    {
      name: 'Date slider',
      say: 'Drag the date slider forward to see tomorrow and next week. An empty outline fills back in only after its two-day reimaging buffer finishes.',
      run: async ({ page }) => {
        const slider = page.getByTestId('date-slider');
        await slider.fill('5');
      },
    },
    {
      name: 'View-as switch',
      say: 'Flip View As from Custodian to Borrower to see the self-service path without leaving the board.',
      run: async ({ page }) => {
        await page.getByRole('radio', { name: 'Borrower' }).click();
      },
    },
    {
      name: 'Reserve best-fit',
      say: 'On the Reserve screen, best-fit allocation picks the laptop with the smallest idle gap so long windows stay open for longer trips.',
      run: async ({ page }) => {
        await page.goto('/#/reserve');
        await page.getByRole('button', { name: 'Confirm reservation' }).waitFor();
      },
    },
    {
      name: 'Hand-out desk kit check',
      say: 'At the Hand-out desk, unchecking a missing USB-C charger on return automatically sends that laptop to repair and removes it from availability.',
      run: async ({ page }) => {
        await page.goto('/#/desk');
        await page.getByRole('heading', { name: 'Hand-out desk' }).waitFor();
      },
    },
  ],
};
