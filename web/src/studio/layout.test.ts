import { describe, expect, it } from 'vitest';
import { computeLayout, gpuDims, gpuMount, PLACE } from './layout';

describe('gpu placement', () => {
  const vis = { L: 0.348, T: 0.072, H: 0.14 };
  for (const ff of ['atx', 'matx'] as const) {
    it(`seats the rolled card inside the case, above the PSU shroud (${ff})`, () => {
      const L = computeLayout({ mobo: { vis: { ff } } });
      const { H, T } = gpuDims(vis);
      const c = gpuMount(L, H, T);
      expect(c.y - T / 2).toBeGreaterThanOrEqual(L.ys);
      expect(c.x - H / 2).toBeGreaterThan(L.mobo.x);
      expect(c.x + H / 2).toBeLessThan(L.xi1);
      const [base] = PLACE.gpu(vis, L);
      expect(base.z - vis.L / 2).toBeGreaterThan(-L.d / 2);
    });
  }
});
