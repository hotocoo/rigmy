import { ROUTES, type RouteDef } from '@/lib/routes';
import type { Check, CatId } from '@/lib/types';

/**
 * Home page presentation settings (layout limits and editorial copy). Domain data never lives here: parts, prices,
 * stores and presets come from `useData()`; story chapter selection/explode/mood comes from lib/choreography.
 */

/** Price movers shown in the "Prices that moved this week" grid. */
export const MOVERS_COUNT = 4;
/** Daily lows drawn in each mover sparkline. */
export const MOVER_SPARK_DAYS = 45;
/** Distinct parts shown in the ticker (sorted by absolute 7-day change). */
export const TICKER_COUNT = 14;
/** Each half of the ticker marquee holds at least this many items so it always overflows the viewport. */
export const TICKER_MIN_HALF = 14;
/** Duration of one ticker loop (ms) and the playback rate while hovered. */
export const TICKER_LOOP_MS = 90000;
export const TICKER_HOVER_RATE = 0.2;
/** Nearest branches listed beside the map. */
export const NEAR_STORES_COUNT = 4;
/** Branches within this distance (km) are framed by the map's "near" focus. */
export const NEAR_KM = 80;
/** Retailer bars in the story's price chapter. */
export const MAX_SHOP_BARS = 6;
/** Placeholder rows drawn in the price chapter while no shop has a price. */
export const EMPTY_SHOP_ROWS = 3;
/** Parts named on each preset card, in this order. */
export const PRESET_LINES: CatId[] = ['cpu', 'gpu', 'case'];

/** Which side of the stage a chapter's copy sits on (the model is framed away from it via CH.shift). */
export type Side = 'left' | 'right';
/**
 * Story part chapters: the chapter index in lib/choreography `CH` (whose `sel` is the part shown), the side its
 * copy sits on, the compatibility check summarised on the card, its kicker, and optional extra copy.
 */
export interface PartChapterDef { ch: number; side: Side; check: Check['id']; kicker: string; extra?: string }
export const PART_CHAPTERS: PartChapterDef[] = [
  { ch: 2, side: 'left', check: 'socket', kicker: 'Processor' },
  { ch: 3, side: 'right', check: 'gpu', kicker: 'Graphics' },
  { ch: 4, side: 'left', check: 'cool', kicker: 'Cooling' },
  { ch: 5, side: 'right', check: 'psu', kicker: 'Power and cables', extra: ' Cables are routed behind the tray in the 3D view, and you can preview sleeved sets before you buy.' },
];
/** Chapter indices (into CH) of the non-part chapters. */
export const CHAPTER = { intro: 0, parts: 1, prices: 6, start: 7 } as const;
/** Side of the stage for the non-part chapters' copy (the start chapter is centred). */
export const CHAPTER_SIDE: Record<'intro' | 'parts' | 'prices', Side> = { intro: 'left', parts: 'right', prices: 'left' };

/** Footer navigation: column title and [route, label] pairs. Labels are footer copy; paths come from ROUTES. */
export const FOOTER_COLUMNS: { title: string; links: [RouteDef, string][] }[] = [
  { title: 'Build', links: [[ROUTES.build, 'Builder'], [ROUTES.parts, 'Parts'], [ROUTES.guide, 'Build guide']] },
  { title: 'Market', links: [[ROUTES.trending, 'Trending'], [ROUTES.watchlist, 'Watchlist']] },
  { title: 'Stores', links: [[ROUTES.stores, 'Store map'], [ROUTES.orders, 'Orders']] },
];
