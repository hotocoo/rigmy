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
  await expect(page).toHaveURL(/\/build/, { timeout: 15_000 });
  await expect(page.getByText('Helang').first()).toBeVisible();
});

test('AR exports the assembled build as a true-scale GLB on desktop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load the Helang build' }).click();
  await expect(page).toHaveURL(/\/build/, { timeout: 15_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('rigmy-build.glb');
  await expect(page.getByText(/Downloaded rigmy-build\.glb/)).toBeVisible();
});

/** Minimal WebXR runtime for an immersive-ar session with hit-test, strict about reference spaces like the spec:
 *  only 'viewer' and 'local' are granted without being requested as features. */
const MOCK_XR = () => {
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, -1.5, 1]);
  class Session extends EventTarget {
    renderState: Record<string, unknown> = {}; inputSources = []; environmentBlendMode = 'alpha-blend'; enabledFeatures = ['hit-test'];
    updateRenderState(s: Record<string, unknown>) { Object.assign(this.renderState, s); }
    async requestReferenceSpace(t: string) { if (t !== 'viewer' && t !== 'local') throw new DOMException(t + ' not granted', 'NotSupportedError'); return { getOffsetReferenceSpace() { return this; } }; }
    async requestHitTestSource() { return { cancel() {} }; }
    requestAnimationFrame(cb: (t: number, f: unknown) => void) { return window.setTimeout(() => cb(performance.now(), { session: this, getViewerPose: () => null, getHitTestResults: () => [{ getPose: () => ({ transform: { matrix: I } }) }] }), 16); }
    cancelAnimationFrame(id: number) { clearTimeout(id); }
    async end() { this.dispatchEvent(new Event('end')); }
  }
  const w = window as unknown as Record<string, unknown>;
  delete w.XRWebGLBinding; // desktop Chromium ships one that only accepts real sessions
  w.XRWebGLLayer = class { framebuffer = null; framebufferWidth = 2; framebufferHeight = 2; ignoreDepthValues = true; getViewport() { return { x: 0, y: 0, width: 2, height: 2 }; } };
  (WebGL2RenderingContext.prototype as unknown as Record<string, unknown>).makeXRCompatible = async () => {};
  const s = new Session(); w.__xrSession = s;
  Object.defineProperty(navigator, 'xr', { value: { isSessionSupported: async (m: string) => m === 'immersive-ar', requestSession: async () => s } });
};

test('AR on a WebXR phone: place, rotate and exit a true-scale build', async ({ page }) => {
  await page.addInitScript(MOCK_XR);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load the Helang build' }).click();
  await expect(page).toHaveURL(/\/build/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'AR', exact: true }).click();
  await expect(page.getByText('Point at the floor, then tap to place')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate' })).toBeDisabled();
  // A tap only places once a hit-test frame has shown the reticle, as on a phone: keep tapping until it lands.
  await expect(async () => {
    await page.evaluate(() => (window as unknown as { __xrSession: EventTarget }).__xrSession.dispatchEvent(new Event('select')));
    await expect(page.getByText('Tap the floor to move it')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Rotate' }).click();
  await page.getByRole('button', { name: 'Exit AR' }).click();
  await expect(page.getByText('Tap the floor to move it')).toBeHidden();
  await expect(page.getByText('AR could not start on this device.')).toHaveCount(0);
});
