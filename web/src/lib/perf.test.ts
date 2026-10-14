import { describe, expect, it } from 'vitest';

import { perfOf } from './perf';
import type { Product } from './types';

const part = (name: string) => ({ name }) as Product;

describe('perfOf', () => {
  it('bands GPUs by chip, not by board partner naming', () => {
    expect(perfOf(null, part('GIGABYTE GeForce RTX 5070 EAGLE ICE OC 12GB')).gpu?.band).toBe('4K60 · 1440p high refresh');
    expect(perfOf(null, part('Colorful GeForce RTX 3050 NB DUO 6G-V 6GB')).gpu?.band).toBe('1080p medium · esports');
    expect(perfOf(null, part('Sapphire Pure Radeon RX 9070 XT 16GB')).gpu?.index).toBe(74);
    // Ti / XT variants are not confused with the base chip.
    expect(perfOf(null, part('MSI RTX 5070 Ti')).gpu?.index).toBe(76);
  });

  it('flags a CPU that will hold a fast card back, and passes a balanced pair', () => {
    expect(perfOf(part('AMD Ryzen 5 5600'), part('ASUS RTX 5080')).balance?.tone).toBe('warn');
    expect(perfOf(part('AMD Ryzen 7 9800X3D'), part('ASUS RTX 5080')).balance?.tone).toBe('ok');
  });

  it('gives no estimate for parts it does not know', () => {
    const v = perfOf(part('Mystery CPU'), part('Mystery GPU'));
    expect([v.gpu, v.cpu, v.balance]).toEqual([null, null, null]);
  });
});
