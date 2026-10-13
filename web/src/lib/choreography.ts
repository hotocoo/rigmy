import type { CatId } from './types';

/**
 * Home scroll-story choreography (presentation, not data). One entry per chapter of the 820vh story:
 * which part the studio highlights, how far the rig is exploded (0..1) and the horizontal frame shift that keeps
 * the model clear of the copy. MOOD is the studio light colour per chapter — hex because it is fed to WebGL.
 */
export const MOOD: string[] = ['#3d8bff', '#a9c6ff', '#ff9a4d', '#3fd1a8', '#4cc9ff', '#ffb347', '#3d8bff', '#7b8bff'];

/** Home scroll-story chapters: studio selection, explode amount and horizontal frame shift. */
export const CH: { sel: CatId | null; ex: number; shift: number }[] = [
  { sel: null, ex: 0, shift: 0.2 },
  { sel: null, ex: 1, shift: -0.17 },
  { sel: 'cpu', ex: 0.55, shift: 0.2 },
  { sel: 'gpu', ex: 0.55, shift: -0.17 },
  { sel: 'cooler', ex: 0.4, shift: 0.2 },
  { sel: 'psu', ex: 0, shift: -0.17 },
  { sel: null, ex: 0, shift: -0.2 },
  { sel: null, ex: 0, shift: 0 },
];
export const RAIL = ['Intro', 'Parts', 'CPU', 'GPU', 'Cooling', 'Power', 'Prices', 'Start'];
