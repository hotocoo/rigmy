import { color, tone } from './tokens';
import type { OpenState, Product } from './types';

/** Locale for every number/date shown in the app (Malaysian English). */
export const LOCALE = 'en-MY';
export const fmt = (n: number) => 'RM ' + Math.round(n).toLocaleString(LOCALE);
export const fmtOr = (n: number | null | undefined, dash = '—') => (n == null ? dash : fmt(n));
export const dFmt = (t: number, yr?: boolean) =>
  new Date(t).toLocaleDateString(LOCALE, yr ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
/** Short weekday, e.g. "Mon". */
export const dDow = (t: number) => new Date(t).toLocaleDateString(LOCALE, { weekday: 'short' });
/** e.g. "Monday, 12 October". */
export const dFull = (t: number) => new Date(t).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
export const dLong = (t: number) => new Date(t).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
export const h12 = (x: number) => {
  const d = ((x % 24) + 24) % 24, h = Math.floor(d), m = Math.round((d - h) * 60);
  return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm');
};
/** Keeps only the digits of typed input (ringgit amounts, postcodes). */
export const digits = (v: string) => v.replace(/\D/g, '');

/** Local midnight of `t`, so day differences ignore the time of day. */
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The noun for a count: "shop" / "shops". */
export const pluralWord = (n: number, one: string, many = one + 's') => (n === 1 ? one : many);
/** A count with its noun: "1 shop" / "1,204 parts". */
export const plural = (n: number, one: string, many = one + 's') => n.toLocaleString(LOCALE) + ' ' + pluralWord(n, one, many);

/** A website's host without `www.`, for compact display (the input when it is not a URL). */
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** Status tone of an online stock state (map pins, stock labels). `none`: the shop does not say. */
export type StockTone = 'ok' | 'warn' | 'error' | 'info' | 'none';
const STOCK_TONE: Record<string, StockTone> = { 'In stock': 'ok', 'Low stock': 'warn', 'Pre-order': 'info', Unknown: 'none' };
/** Anything not listed above ('Out of stock', 'No delivery', …) cannot be bought and reads as an error. */
export const stockTone = (s: string): StockTone => STOCK_TONE[s] ?? 'error';
/** Colour of a stock state; `null` (the retailer does not list the part) is the pending tone. */
export const stockColor = (s: string | null | undefined) => {
  if (s == null) return tone.pending;
  const t = stockTone(s);
  return t === 'none' ? color.muted : tone[t];
};

/** tel: link from a display phone number. */
export const telHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

/** WhatsApp chat link for a Malaysian number (local 0… becomes 60…), with a prefilled message. */
export const whatsappHref = (phone: string, text: string) => {
  const d = phone.replace(/\D/g, '');
  return 'https://wa.me/' + (d.startsWith('0') ? '6' + d : d) + '?text=' + encodeURIComponent(text);
};

/** Product link that applies `code` at the shop's checkout: Shopify's `/discount/<code>?redirect=<path>`. Other
 *  platforms (or no code) get the link unchanged; the buyer enters the code at the shop's checkout. */
export function promoUrl(url: string, code: string | undefined, platform: string | undefined): string {
  const c = (code || '').trim();
  if (!c || platform !== 'shopify') return url;
  try {
    const u = new URL(url);
    return u.origin + '/discount/' + encodeURIComponent(c) + '?redirect=' + encodeURIComponent(u.pathname + u.search);
  } catch {
    return url;
  }
}

/** Colour of a branch's open state: open (ok), closing soon (warn), closed or hours unknown (muted). */
export const openColor = (o: OpenState) => (o.unknown || !o.open ? color.muted : o.closing ? tone.warn : tone.ok);

export const chgTxt = (x: number | null) =>
  x == null ? '—' : (x < -0.0005 ? '▼ ' : x > 0.0005 ? '▲ ' : '') + Math.abs(x * 100).toFixed(1) + '%';
export const chgColor = (x: number | null, flat: string = color.muted) => (x == null ? flat : x < -0.0005 ? tone.ok : x > 0.0005 ? tone.warn : flat);

export function spark(vals: number[], w: number, h: number) {
  if (vals.length < 2) return { line: '', area: '' };
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => ((i / (vals.length - 1)) * w).toFixed(1) + ',' + (3 + (1 - (v - mn) / r) * (h - 6)).toFixed(1));
  return { line: pts.join(' '), area: 'M0,' + h + ' L' + pts.join(' L') + ' L' + w + ',' + h + ' Z' };
}

export function keySpecs(p: Product) {
  const s = p.specs as Record<string, string | number | undefined>;
  /** `v` + unit, or nothing when the spec is unknown (parts promoted from listings carry only what they state). */
  const u = (v: string | number | undefined, unit = '', pre = '') => (v == null || v === '' ? null : pre + String(v) + unit);
  const parts: (string | null)[] = (() => {
    switch (p.cat) {
      case 'cpu': return [u(s.cores, ' cores'), u(s.boost, ' GHz'), u(s.l3, ' MB L3'), u(s.tdp, ' W'), p.source ? u(s.socket) : null];
      case 'cooler': return [u(s.type), u(s.fans), u(s.noise, ' dBA')];
      case 'mobo': return [u(s.socket), u(s.ff), u(s.chipset), u(s.wifi === 'Yes' ? 'Wi-Fi' : s.wifi), p.source ? u(s.mem) : null];
      case 'ram': return [u(s.kit) ?? u(s.cap, ' GB'), u(s.speed, ' MT/s'), u(s.cl, '', 'CL'), p.source ? u(s.type) : null];
      case 'ssd': return [u(s.cap), u(s.iface), s.read == null ? null : Number(s.read).toLocaleString(LOCALE) + ' MB/s'];
      case 'gpu': return [s.vram == null ? null : s.vram + ' GB' + (s.mem ? ' ' + s.mem : ''), u(s.tgp, ' W'), u(s.length, ' mm')];
      case 'case': return [u(s.type), u(s.maxGpu, ' mm', 'GPU up to '), u(s.radTop, ' top'), p.source ? u(s.ffs) : null];
      case 'psu': return [u(s.watt, ' W'), u(s.eff), u(s.mod)];
    }
    return [];
  })();
  return parts.filter(Boolean).join(' · ');
}

export function specVal(v: string | number | undefined | null, u?: string) {
  if (v == null || v === '—') return '—';
  if (typeof v === 'number') return v.toLocaleString(LOCALE) + (u ? ' ' + u : '');
  return String(v);
}

export const warrantyText = (y: number) => (y >= 99 ? 'Lifetime' : y + ' yr' + (y > 1 ? 's' : ''));

export const RANGES: [string, number][] = [['1M', 30], ['3M', 90], ['6M', 180], ['1Y', 365]];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY = 864e5;
export const MODE_LABEL = { best: 'Lowest total', fast: 'Fastest delivery', single: 'One shop', custom: 'Custom picks' } as const;
