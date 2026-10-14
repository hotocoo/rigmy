// Gaming performance estimates for a build: what the graphics card is suited to and whether the CPU keeps up.
// Bands, not frame rates. The ordering follows the broad consensus of independent reviews (relative raster
// performance at 1440p); it is an estimate and the UI says so. A chip not listed here gets no estimate.
import type { Product } from './types';

/** Relative GPU performance (RTX 4090 = 100), by chip. */
const GPU_INDEX: [RegExp, number][] = [
  [/RTX\s?5090/i, 130], [/RTX\s?4090/i, 100], [/RTX\s?5080/i, 88], [/RTX\s?4080\s?Super/i, 83], [/RTX\s?4080/i, 80],
  [/RX\s?7900\s?XTX/i, 80], [/RTX\s?5070\s?Ti/i, 76], [/RX\s?9070\s?XT/i, 74], [/RTX\s?4070\s?Ti\s?Super/i, 70],
  [/RX\s?7900\s?XT\b/i, 70], [/RX\s?9070\s?GRE/i, 58], [/RX\s?9070\b/i, 66], [/RTX\s?4070\s?Ti/i, 63], [/RTX\s?5070\b/i, 61],
  [/RTX\s?4070\s?Super/i, 60], [/RX\s?7900\s?GRE/i, 58], [/RX\s?7800\s?XT/i, 54], [/RTX\s?4070\b/i, 50], [/RTX\s?3080/i, 48],
  [/RX\s?7700\s?XT/i, 46], [/RX\s?9060\s?XT/i, 42], [/RTX\s?5060\s?Ti/i, 42], [/RTX\s?3070/i, 40], [/RTX\s?4060\s?Ti/i, 36],
  [/RTX\s?5060\b/i, 36], [/RTX\s?3060\s?Ti/i, 34], [/RX\s?7600\s?XT/i, 30], [/RTX\s?5050/i, 28], [/RX\s?7600\b/i, 28],
  [/RTX\s?4060\b/i, 28], [/RTX\s?3060\b/i, 26], [/RTX\s?3050/i, 16],
];

/** GPU bands by index: the resolution / settings class a card handles in current games. */
const GPU_BANDS: [number, string][] = [
  [85, '4K high refresh'], [60, '4K60 · 1440p high refresh'], [45, '1440p high settings'], [30, '1080p high refresh · 1440p medium'],
  [18, '1080p high settings'], [0, '1080p medium · esports'],
];

/** CPU gaming tier (higher = keeps faster GPUs fed at high frame rates), by model. */
const CPU_TIER: [RegExp, number][] = [
  [/\b9[89]50X3D|\b9800X3D|\b7800X3D|\b7950X3D|\b9900X3D/i, 5],
  [/\b9[79]00X\b|\b9950X\b|\b7[79]00X\b|\b7950X\b|\b2[68]5K/i, 4],
  [/\b9600X?\b|\b7600X?\b|\b5800X3D|\b245K|\b14[67]00K|\b13[67]00K|\b265/i, 3],
  [/\b5[6-9]00X?\b|\b8[56]00G|\b1[234]400F?\b|\b225F?\b/i, 2],
  [/\b5500\b|\b5600G\b|\b3[0-9]00\b|\b1[01]400/i, 1],
];
const CPU_LABEL = ['', 'entry-level', 'mainstream', 'strong', 'high-end', 'top-tier'];

const hit = <T,>(table: [RegExp, T][], name: string): T | null => table.find(([re]) => re.test(name))?.[1] ?? null;

export interface PerfView {
  gpu: { band: string; index: number } | null;
  cpu: { tier: number; label: string } | null;
  /** Balance note when both are known, else null. */
  balance: { text: string; tone: 'ok' | 'warn' } | null;
}

export function perfOf(cpu: Product | null, gpu: Product | null): PerfView {
  const gi = gpu ? hit(GPU_INDEX, gpu.name) : null;
  const ct = cpu ? hit(CPU_TIER, cpu.name) : null;
  const g = gi == null ? null : { index: gi, band: GPU_BANDS.find(([min]) => gi >= min)![1] };
  const c = ct == null ? null : { tier: ct, label: CPU_LABEL[ct] };
  let balance: PerfView['balance'] = null;
  if (g && c) {
    // A fast card wants a fast CPU for high frame rates; a strong CPU with a slow card is fine (GPU-bound).
    const want = g.index >= 75 ? 4 : g.index >= 45 ? 3 : 2;
    balance = c.tier >= want
      ? { text: 'Balanced: the CPU keeps this card fed.', tone: 'ok' }
      : { text: 'The CPU may hold this card back at high frame rates (1080p / 1440p). 4K is less affected.', tone: 'warn' };
  }
  return { gpu: g, cpu: c, balance };
}
