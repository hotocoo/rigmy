'use client';

import { plural } from '@/lib/format';
import type { Eta, OrderGroup } from '@/lib/types';

/** "3 items" / "1 item". */
export const countText = (n: number) => plural(n, 'item');

/** "Step 03" for a numbered build-flow route (lib/routes `step`). */
export const stepLabel = (step: number) => 'Step ' + String(step).padStart(2, '0');

/** A delivery bucket in running text ("arrives in 2–3 days"). */
export const etaLower = (e: Eta | null | undefined) => (e ? e.toLowerCase() : 'an unknown time');

/** Message of an unknown thrown value. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Distinct product links of a retailer group, in item order. */
export const groupUrls = (g: Pick<OrderGroup, 'items'>) => Array.from(new Set(g.items.map((i) => i.url).filter(Boolean)));

/** Opens every product link of a retailer group in its own tab. */
export function openAll(urls: string[]) {
  urls.forEach((u) => window.open(u, '_blank', 'noopener'));
}

