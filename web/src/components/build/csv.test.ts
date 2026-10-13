import { describe, expect, it } from 'vitest';

import { mkData, offer, planTotal, product } from '@/lib/testdata';

import { buildCsv } from './csv';

const lines = (csv: string) => csv.split('\r\n');

describe('buildCsv', () => {
  it('writes one row per selected part with the lowest offer', () => {
    const d = mkData({
      byId: { 'cpu-a': product('cpu-a', { name: 'CPU A' }), 'mobo-b': product('mobo-b', { name: 'Mobo B', cat: 'mobo' }) },
      lowest: { 'cpu-a': offer({ price: 2099, fee: 0, url: 'https://shop.test/cpu-a' }) },
      plan: planTotal({ parts: 2099, fee: 0, total: 2099, shops: 1, missing: 1 }),
    });
    const rows = lines(buildCsv(d, { cpu: 'cpu-a', mobo: 'mobo-b' }, 'kv'));
    expect(rows[0]).toBe('"Slot","Part","Brand","Price (RM)","Retailer","Stock","Delivery","URL"');
    expect(rows[1]).toBe('"CPU","CPU A","Brand cpu-a","2099","Shop R","In stock","Free","https://shop.test/cpu-a"');
    // Unpriced part: blank price, honest status, no URL.
    expect(rows[2]).toBe('"Motherboard","Mobo B","Brand mobo-b","","","No price yet","",""');
    expect(rows[3]).toBe('"Total (lowest, incl. delivery)","","","2099","","","",""');
  });

  it('omits the total row when nothing is priced', () => {
    const d = mkData({
      byId: { 'cpu-a': product('cpu-a') },
      plan: planTotal({ missing: 1, total: 0 }),
    });
    const rows = lines(buildCsv(d, { cpu: 'cpu-a' }, 'kv'));
    expect(rows[2]).toBe('"Total","","","","No priced parts in this region yet","","",""');
    expect(rows.length).toBe(3);
  });

  it('quotes embedded commas and quotes per RFC 4180', () => {
    const d = mkData({
      byId: { 'cpu-a': product('cpu-a', { name: 'CPU, "the" A' }) },
      lowest: { 'cpu-a': offer({ price: 100, fee: 15 }) },
      plan: planTotal({ parts: 100, fee: 15, total: 115, shops: 1, missing: 0 }),
    });
    const rows = lines(buildCsv(d, { cpu: 'cpu-a' }, 'kv'));
    expect(rows[1]).toContain('"CPU, ""the"" A"');
  });

  it('is a header-only sheet for an empty build', () => {
    const d = mkData({});
    expect(buildCsv(d, {}, 'kv').split('\r\n').length).toBe(1);
  });
});
