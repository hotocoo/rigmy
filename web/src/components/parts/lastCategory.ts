import type { Data } from '@/lib/data';
import type { CatId } from '@/lib/types';

/**
 * The last browsed category — a per-browser convenience so `/parts` reopens where the user left off.
 * Not part of the persisted rig state; storage can be unavailable (private mode, blocked site data), so every access
 * is guarded and the first configured category is the fallback.
 */
const STORAGE_KEY = 'rigmy:parts:last-category';

export function lastBrowseCat(d: Data): CatId | null {
  let v: string | null = null;
  try { v = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  return d.categories.find((c) => c.id === v)?.id ?? d.categories[0]?.id ?? null;
}

export function rememberBrowseCat(cat: CatId) {
  try { localStorage.setItem(STORAGE_KEY, cat); } catch { /* storage unavailable */ }
}
