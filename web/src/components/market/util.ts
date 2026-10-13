/** Small helpers shared by the market pages (trending, stores, watchlist, shared build). */
import type { StockState } from '@/lib/types';

/**
 * Minimum days of price history before a part counts towards trends, drops and "closest to low". Matches the API's
 * 7-day change window (`PartStats.d7`), so a part with less history has no meaningful weekly change yet.
 */
export const MIN_TREND_DAYS = 7;

/** "Price tracking started N days ago — trends appear after 7 days of data". */
export function trackingMsg(daysAgo: number | null, need = MIN_TREND_DAYS) {
  const tail = ' — trends appear after ' + need + ' days of data';
  if (daysAgo == null) return 'No price history recorded yet' + tail;
  return 'Price tracking started ' + (daysAgo <= 0 ? 'today' : daysAgo === 1 ? '1 day ago' : daysAgo + ' days ago') + tail;
}

/** Stock states a shopper can actually buy today. */
export const inStock = (s: StockState | undefined) => s === 'In stock' || s === 'Low stock';

