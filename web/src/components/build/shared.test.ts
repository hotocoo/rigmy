import { describe, expect, it } from 'vitest';

import { mkData, offer, planTotal } from '@/lib/testdata';
import type { Check, Power } from '@/lib/types';

import { errText, noPriceNote, partPrice, powerView, presetName, totalView } from './shared';

describe('partPrice', () => {
  it('shows the lowest offer when one is available', () => {
    const d = mkData({ lowest: { 'cpu-a': offer({ price: 1234.5 }) } });
    const p = partPrice(d, 'cpu-a', 'kv');
    expect(p.price).toBe(1234.5);
    expect(p.text).toBe('RM 1,235');
  });

  it('says No price yet when nothing is listed', () => {
    const d = mkData({});
    expect(partPrice(d, 'cpu-a', 'kv').text).toBe('No price yet');
  });

  it('says No delivery when every listing refuses to deliver', () => {
    const d = mkData({ offers: { 'cpu-a': [offer({ status: 'No delivery' }), offer({ status: 'No delivery' })] } });
    expect(partPrice(d, 'cpu-a', 'kv').text).toBe('No delivery');
  });

  it('says Sold out when listed but none is buyable', () => {
    const d = mkData({ offers: { 'cpu-a': [offer({ status: 'Out of stock' })] } });
    expect(partPrice(d, 'cpu-a', 'kv').text).toBe('Sold out');
  });
});

describe('totalView', () => {
  const d = mkData({});

  it('asks for parts on an empty build', () => {
    expect(totalView(d, {}, 'kv', planTotal({}), 0)).toEqual({
      total: 'RM 0',
      note: 'Add parts to see prices',
      priced: true,
    });
  });

  it('never invents a total when nothing is priced', () => {
    const t = planTotal({ missing: 2, total: 0 });
    const v = totalView(d, { cpu: 'cpu-a', mobo: 'mobo-b' }, 'kv', t, 2);
    expect(v.total).toBe('—');
    expect(v.priced).toBe(false);
  });

  it('shows shops and delivery when priced', () => {
    const t = planTotal({ parts: 1000, fee: 10, total: 1010, shops: 1, missing: 0 });
    const v = totalView(d, { cpu: 'cpu-a' }, 'kv', t, 1);
    expect(v.total).toBe('RM 1,010');
    expect(v.note).toContain('1 shop');
    expect(v.note).toContain('RM 10 delivery');
  });
});

describe('powerView', () => {
  const pw = (over: Partial<Power>): Power => ({ est: 300, rec: 500, psu: 0, ...over });

  it('scales against 1000 W when no PSU is chosen', () => {
    const v = powerView(pw({}));
    expect(v.text).toBe('300 W estimated');
    expect(v.ratio).toBeCloseTo(0.3);
  });

  it('turns red when the PSU is under the estimate', () => {
    const v = powerView(pw({ est: 600, rec: 800, psu: 500 }));
    expect(v.text).toBe('600 W of 500 W');
    expect(v.color).toContain('error');
  });

  it('warns below the recommended headroom', () => {
    const v = powerView(pw({ est: 300, rec: 500, psu: 450 }));
    expect(v.color).toContain('warn');
  });

  it('is green at or above the recommendation', () => {
    const v = powerView(pw({ est: 300, rec: 500, psu: 650 }));
    expect(v.color).toContain('ok');
  });
});

describe('presetName and errText', () => {
  it('names a build only when every slot matches exactly', () => {
    const d = mkData({
      presets: [{ id: 'k', name: 'Kancil', build: { cpu: 'cpu-a', mobo: 'mobo-b' } }],
    });
    expect(presetName(d, { cpu: 'cpu-a', mobo: 'mobo-b' })).toBe('Kancil');
    expect(presetName(d, { cpu: 'cpu-a', mobo: 'other' })).toBe(null);
  });

  it('counts issues for the checkout gate', () => {
    const mk = (n: number): Check[] =>
      Array.from({ length: n }, (_, i) => ({ id: 'socket', label: 'Issue ' + i, value: '', status: 'error', parts: [], detail: '', fix: null } as Check));
    // (0 is never rendered — the gate only shows when issues exist.)
    expect(errText(mk(1))).toBe('1 issue needs fixing before checkout: issue 0.');
    expect(errText(mk(2))).toBe('2 issues need fixing before checkout: issue 0, issue 1.');
  });
});

describe('noPriceNote', () => {
  it('says nobody delivers rather than sold out when stock exists elsewhere', () => {
    expect(noPriceNote([offer({ status: 'No delivery' })], 'Klang Valley')).toBe('Listed at 1 shop, none delivers to Klang Valley yet');
    expect(noPriceNote([offer({ status: 'Out of stock' })], 'Klang Valley')).toBe('No shop has it in stock for Klang Valley');
  });
});
