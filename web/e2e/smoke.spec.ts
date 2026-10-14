import { expect, test } from '@playwright/test';

// Smoke tests over the real stack. They assert on the seed catalogue and on
// engine behaviour — never on live feed prices: in CI the API runs from a
// freshly seeded database with no offers, so price areas are read honestly.

test('home loads with the brand and preset starting points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'RigMY home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Load a build and change what you like' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load the Helang build' })).toBeVisible();
});

test('browse lists the catalogue CPUs and search filters them', async ({ page }) => {
  await page.goto('/parts/cpu');
  // The name also appears in the preview panel, so take the first match.
  await expect(page.getByText('Ryzen 7 9800X3D').first()).toBeVisible();
  await expect(page.getByText('Core Ultra 7 265K').first()).toBeVisible();
  await page.getByPlaceholder('Search processors by name or spec').fill('9950');
  await expect(page.getByText('Ryzen 9 9950X3D').first()).toBeVisible();
  // The list row is gone (the preview panel may still show the old part).
  await expect(page.getByRole('button', { name: /Preview .*9800X3D/ })).toHaveCount(0);
});

test('part preview shows verified specs and an honest price state', async ({ page }) => {
  await page.goto('/parts/cpu');
  await page.getByText('Ryzen 7 9800X3D').first().click();
  await expect(page.getByText('AM5').first()).toBeVisible();
  // With or without live offers, the price area says something true.
  await expect(page.getByText(/RM \d|No price yet/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to build' })).toBeVisible();
});

test('builder shows the part, swap suggestions and power estimate', async ({ page }) => {
  await page.goto('/parts/cpu');
  await page.getByText('Ryzen 7 9800X3D').first().click();
  await page.getByRole('button', { name: 'Add to build' }).click();
  await page.goto('/build');
  await expect(page.getByText('9800X3D').first()).toBeVisible();
  // The 9950X3D shares the AM5 socket, so it is a listed swap.
  await expect(page.getByText('Swap or upgrade')).toBeVisible();
  await expect(page.getByText('9950X3D').first()).toBeVisible();
  await expect(page.getByText(/W estimated/)).toBeVisible();
});

test('a preset loads a complete build', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load the Helang build' }).click();
  await expect(page).toHaveURL(/\/build/);
  await expect(page.getByText('Helang').first()).toBeVisible();
});

test('AR exports the assembled build as a true-scale GLB on desktop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load the Helang build' }).click();
  await expect(page).toHaveURL(/\/build/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('rigmy-build.glb');
  await expect(page.getByText(/Downloaded rigmy-build\.glb/)).toBeVisible();
});
