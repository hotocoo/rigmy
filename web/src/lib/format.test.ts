import { describe, expect, it } from 'vitest';

import { digits, fmt, fmtOr, h12, hostOf, plural, promoUrl, startOfDay, stockTone, whatsappHref } from './format';

describe('format', () => {
  it('formats ringgit with the locale separator', () => {
    expect(fmt(1234.5)).toBe('RM 1,235');
    expect(fmt(0)).toBe('RM 0');
  });

  it('fmtOr falls back to a dash for missing values', () => {
    expect(fmtOr(null)).toBe('—');
    expect(fmtOr(undefined)).toBe('—');
    expect(fmtOr(500)).toBe('RM 500');
  });

  it('digits keeps only digits of typed input', () => {
    expect(digits('1a2b3c')).toBe('123');
    expect(digits('')).toBe('');
  });

  it('plural handles one and many', () => {
    expect(plural(1, 'shop')).toBe('1 shop');
    expect(plural(2, 'shop')).toBe('2 shops');
    expect(plural(1, 'part', 'parts')).toBe('1 part');
  });

  it('hostOf strips www and the path', () => {
    expect(hostOf('https://www.lazada.com.my/groceries')).toBe('lazada.com.my');
    expect(hostOf('not a url')).toBe('not a url');
  });

  it('h12 renders Malaysian hours', () => {
    expect(h12(9.5)).toBe('9:30 am');
    expect(h12(14)).toBe('2 pm');
    expect(h12(0)).toBe('12 am');
  });

  it('startOfDay zeroes the time of day', () => {
    const t = new Date(2026, 9, 13, 15, 30, 45).getTime();
    expect(startOfDay(t)).toBe(new Date(2026, 9, 13).getTime());
  });

  it('stockTone maps states honestly', () => {
    expect(stockTone('In stock')).toBe('ok');
    expect(stockTone('Low stock')).toBe('warn');
    expect(stockTone('Pre-order')).toBe('info');
    expect(stockTone('Unknown')).toBe('none');
    expect(stockTone('Out of stock')).toBe('error');
    expect(stockTone('No delivery')).toBe('error');
  });
});

describe('promoUrl', () => {
  it('routes Shopify product links through /discount so the code applies at checkout', () => {
    expect(promoUrl('https://shop.my/products/rtx-5070?variant=1', ' SAVE10 ', 'shopify')).toBe('https://shop.my/discount/SAVE10?redirect=%2Fproducts%2Frtx-5070%3Fvariant%3D1');
  });
  it('leaves links alone without a code or off Shopify', () => {
    expect(promoUrl('https://shop.my/p/1', '', 'shopify')).toBe('https://shop.my/p/1');
    expect(promoUrl('https://shop.my/p/1', 'X', 'woocommerce')).toBe('https://shop.my/p/1');
  });
});

describe('whatsappHref', () => {
  it('turns a local Malaysian number into an international wa.me link', () => {
    expect(whatsappHref('03-2142 1234', 'hi there')).toBe('https://wa.me/60321421234?text=hi%20there');
  });
});
