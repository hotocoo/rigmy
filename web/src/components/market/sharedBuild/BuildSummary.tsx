'use client';

import { useMemo } from 'react';
import { toast } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Meta, Price, Progress } from '@/components/ui';
import { regionById } from '@/lib/content';
import { useData } from '@/lib/data';
import { dFmt, fmt, plural } from '@/lib/format';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Build, SavedBuild } from '@/lib/types';
import { MarketHeader, MarketPage, SectionHead, StatTiles, type StatTile } from '../MarketHeader';
import { BuildParts, CheckPills } from './BuildParts';
import m from '../market.module.css';
import b from './sharedBuild.module.css';
import { requiredCats } from '@/lib/content';

/** With no PSU chosen the power bar is scaled to 1000 W, the top of the common consumer PSU range. */
const POWER_SCALE_W = 1000;

/** Read-only summary of a saved build with live compatibility, power and today's lowest prices. */
export function BuildSummary({ sb }: { sb: SavedBuild }) {
  const d = useData();
  const go = useGo();
  const region = regionById(d, sb.region);
  const rid = region.id;
  const parts = useMemo(() => d.categories.map((c) => {
    const id = sb.build[c.id];
    return { c, p: id ? d.byId[id] || null : null };
  }), [d, sb]);
  const build: Build = useMemo(() => Object.fromEntries(parts.flatMap((x) => (x.p ? [[x.c.id, x.p.id]] : []))), [parts]);
  const checks = useMemo(() => d.engine.compat(build), [d, build]);
  const pw = useMemo(() => d.engine.power(build), [d, build]);
  const best = useMemo(() => d.engine.plan(build, rid, {}).best, [d, build, rid]);

  const count = parts.filter((x) => x.p).length;
  const missingIds = d.categories.filter((c) => sb.build[c.id] && !d.byId[sb.build[c.id]!]).length;
  const okN = checks.filter((c) => c.status === 'ok').length, errN = checks.filter((c) => c.status === 'error').length, warnN = checks.filter((c) => c.status === 'warn').length;
  const priced = count - best.missing;

  const powerColor = !pw.psu ? null : pw.psu < pw.est ? tone.error : pw.psu < pw.rec ? tone.warn : tone.ok;
  const powerShare = pw.est / (pw.psu || POWER_SCALE_W);

  const tiles: StatTile[] = [
    { label: 'Lowest total', value: priced ? fmt(best.total) : '—', c: color.fg, note: priced ? 'Across ' + plural(best.shops, 'shop') + (best.fee ? ' · incl. ' + fmt(best.fee) + ' delivery' : '') + (best.unknownFees ? ' · some delivery fees unknown' : '') : 'No shop lists these parts in stock yet' },
    { label: 'Parts', value: count + '/' + requiredCats(d).length, c: count >= requiredCats(d).length ? tone.ok : tone.warn, note: best.missing ? plural(best.missing, 'part') + ' not in stock in ' + region.name : 'All in stock in ' + region.name },
    { label: 'Compatibility', value: checks.length ? okN + '/' + checks.length : '—', c: errN ? tone.error : warnN ? tone.warn : tone.ok, note: errN ? plural(errN, 'problem') + ' to fix' : warnN ? plural(warnN, 'check') + ' to look at' : 'Every check passes' },
    { label: 'Estimated power', value: pw.est + ' W', c: powerColor || color.fg, note: pw.rec + ' W PSU recommended' },
  ];
  const compatTxt = errN ? plural(errN, 'compatibility problem') : warnN ? plural(warnN, 'check') + ' to look at' : checks.length ? 'every compatibility check passes' : 'add parts to run compatibility checks';

  const openInBuilder = () => {
    useRig.getState().set({ build: { ...build }, region: rid, picks: {}, planMode: 'best' });
    toast('Loaded “' + sb.name + '” into the builder');
    go(ROUTES.build.path);
  };
  const copy = () => {
    const url = window.location.href;
    if (!navigator.clipboard) { toast(url); return; }
    navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast(url));
  };

  return (
    <MarketPage narrow>
      <MarketHeader eyebrow={'Shared build · saved ' + dFmt(sb.createdAt, true) + ' · ' + region.name + ' prices'} title={sb.name || 'Untitled build'}
        lede={plural(count, 'part') + ' · ' + compatTxt + '. Prices below are today’s lowest in-stock offers, not the prices when it was saved.'}>
        <div className={m.actions}>
          <Button onClick={openInBuilder}>Open in builder</Button>
          <Button variant="ghost" onClick={copy}>Copy link</Button>
        </div>
      </MarketHeader>

      <StatTiles tiles={tiles} />
      {checks.length > 0 && <CheckPills checks={checks} />}

      <section className={m.stack} aria-label="Parts">
        <SectionHead title="Parts" note={'Lowest in-stock price · ' + region.name} />
        <BuildParts parts={parts} checks={checks} region={rid} open={(id) => go(href.part(id))} />
        {missingIds > 0 && <Meta>{plural(missingIds, 'part') + ' in this build is no longer in the catalogue.'}</Meta>}
      </section>

      <section data-rv="1" className={b.power} aria-label="Estimated power">
        <div className={b.powerHead}>
          <Eyebrow>Estimated power</Eyebrow>
          <Eyebrow c={powerColor || color.muted}>{pw.psu ? pw.est + ' W of ' + pw.psu + ' W' : pw.est + ' W estimated'}</Eyebrow>
        </div>
        <Progress value={powerShare} height={4} c={powerColor || color.muted} />
        <Meta>{pw.rec + ' W recommended for this CPU and graphics card'}</Meta>
      </section>

      <div data-rv="1" className={b.footer}>
        <Meta>{priced ? plural(priced, 'part') + ' priced · ' + plural(best.shops, 'shop') : 'No prices yet'}</Meta>
        <div className={b.footerEnd}>
          <Price value={priced ? best.total : null} empty="—" v="priceLg" emptyColor={color.fg} />
          <Button size="tall" wide onClick={openInBuilder}>Open in builder</Button>
        </div>
      </div>
    </MarketPage>
  );
}
