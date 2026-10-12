import { DEF } from '@/lib/store';
import type { RigState } from '@/lib/store';
import type { StockState } from '@/lib/types';

/** The facet chip that shows every part of a category (the store's default facet, so a reset matches a fresh visit). */
export const ALL_FACET = DEF.facet;

/** Browse sort options, in chip order. Keys are the store's `sort` values. */
export const SORT_OPTIONS: { id: RigState['sort']; label: string }[] = [
  { id: 'price', label: 'Lowest price' },
  { id: 'desc', label: 'Highest price' },
  { id: 'name', label: 'Name' },
];

/** How many of the nearest branches (of retailers listing the part) the part page lists and pins on the map. */
export const NEAREST_BRANCH_LIMIT = 12;

/** Branches within this many km are flagged `near` so the map frames them first. */
export const MAP_NEAR_KM = 80;

/** Online stock states that mean a branch cannot hand the part over today, so "Pick up here" is not offered. */
export const NO_PICKUP_STOCK: readonly StockState[] = ['Out of stock', 'Pre-order'];

/** Price-alert suggestion: this fraction of today's price (a 5 % drop)… */
export const ALERT_SUGGEST_FACTOR = 0.95;
/** …rounded to the nearest RM 10 and then one ringgit under it (RM 1,899 rather than RM 1,900), never below RM 1. */
export const ALERT_ROUND_RM = 10;

/** Today's price within ± this many RM of the 90-day average reads as "matches it" (and is not coloured). */
export const AVG_MATCH_TOLERANCE_RM = 5;

/**
 * Delay before the "added to your build" toast, so it lands after the page wipe has covered the screen and the
 * builder has started to reveal (wipe cover 380 ms + hold, see shell/useGo).
 */
export const ADD_TOAST_DELAY_MS = 700;
