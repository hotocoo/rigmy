'use client';

import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dot, Eyebrow, Meta, Text } from '@/components/ui';
import { regionById, requiredCats } from '@/lib/content';
import { cx } from '@/lib/cx';
import { DataProvider, useData, useDataStatus } from '@/lib/data';
import { fmt } from '@/lib/format';
import { describeLoc, useUserLoc } from '@/lib/location';
import { isActive, linkRoutes, ROUTES, stepRoutes, type RouteDef } from '@/lib/routes';
import { hydrateRig, useRig } from '@/lib/store';
import { color, glow, type } from '@/lib/tokens';
import { LocPanel } from './LocPanel';
import { bindToast, startReveal } from './motion';
import { bindWipe, notifyRouteCommit, useGo } from './useGo';
import s from './shell.module.css';


export function AppShell({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { Promise.resolve(hydrateRig()).finally(() => setHydrated(true)); }, []);
  useEffect(() => startReveal(), []);
  return (
    <DataProvider>
      <div className={s.root}>
        <Suspense fallback={<div className={s.navPlaceholder} />}><Nav /></Suspense>
        {hydrated ? <DataGate>{children}</DataGate> : <Splash />}
        <Suspense fallback={null}><RouteCommit /></Suspense>
        <Wipe />
        <Toast />
      </div>
    </DataProvider>
  );
}

function Splash({ title, sub }: { title?: string; sub?: ReactNode }) {
  const c = title ? color.error : color.blue;
  return (
    <div className={s.splash}>
      <div className={s.splashInner} role={title ? 'alert' : 'status'}>
        <span className={s.pulse} style={{ background: c, boxShadow: glow(c) }} />
        <Eyebrow>{title ? 'Unavailable' : 'Loading RigMY'}</Eyebrow>
        {title && <Text v="h3">{title}</Text>}
        {sub && <Meta style={{ lineHeight: 1.6 }}>{sub}</Meta>}
      </div>
    </div>
  );
}

function DataGate({ children }: { children: ReactNode }) {
  const st = useDataStatus();
  if (st.state === 'loading') return <Splash />;
  if (st.state === 'error') return <Splash title="Can't reach the RigMY API" sub={<>{st.error}. Start it with <code className={s.code}>rigmy-api serve</code> (see docs/BACKEND.md), then reload.</>} />;
  return <>{children}</>;
}

function useNavRef() {
  const ro = useRef<ResizeObserver | null>(null);
  return (el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--nav', Math.round(el.getBoundingClientRect().height) + 1 + 'px');
    set();
    ro.current = new ResizeObserver(set);
    ro.current.observe(el);
  };
}

function useNavItems() {
  const orders = useRig((x) => x.orders), watch = useRig((x) => x.watch), compare = useRig((x) => x.compare);
  const badge = (r: RouteDef) => (r === ROUTES.watchlist ? watch.length : r === ROUTES.compare ? compare.length : 0);
  return { steps: stepRoutes(), links: linkRoutes().filter((r) => !r.needsOrders || orders.length > 0), badge };
}

function Nav() {
  const st = useDataStatus();
  const path = usePathname();
  const go = useGo();
  const navRef = useNavRef();
  const [locOpen, setLocOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const { steps, links, badge } = useNavItems();
  useEffect(() => {
    if (!menu && !locOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setLocOpen(false); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [menu, locOpen]);
  const nav = (p: string) => { setMenu(false); go(p); };
  return (
    <>
      <nav ref={navRef} className={s.nav} aria-label="Main">
        <Text v="brand" as="button" onClick={() => nav(ROUTES.home.path)} className={s.brand} aria-label="RigMY home">Rig<span>MY</span></Text>
        <div className={s.steps}>
          {steps.map((r) => {
            const on = isActive(r, path);
            return (
              <button key={r.path} onClick={() => nav(r.path)} className={cx(s.step, on && s.stepOn)} aria-current={on ? 'page' : undefined}>
                <span className={s.stepIdx}>{String(r.step).padStart(2, '0')}</span><span>{r.navLabel}</span>
              </button>
            );
          })}
        </div>
        <div className={s.spacer} />
        <div className={s.links}>
          {links.map((r) => {
            const on = isActive(r, path), bd = badge(r);
            return (
              <button key={r.path} onClick={() => nav(r.path)} className={cx(s.link, on && s.linkOn)} aria-current={on ? 'page' : undefined}>
                <span>{r.navLabel}</span>{bd > 0 && <span className={s.badge}>{bd}</span>}
              </button>
            );
          })}
        </div>
        {st.state === 'ready' && <NavRight locOpen={locOpen} toggleLoc={() => { setMenu(false); setLocOpen((x) => !x); }} />}
        <button className={s.menuBtn} onClick={() => { setLocOpen(false); setMenu((x) => !x); }} aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu}>
          <span className={cx(s.burger, menu && s.burgerOpen)} />
        </button>
      </nav>
      {menu && (
        <div className={s.drawer} data-rv="s">
          <div className={s.drawerGroup}>
            <Eyebrow c={color.blueSoft} className={s.drawerLabel}>Build</Eyebrow>
            {steps.map((r) => (
              <button key={r.path} onClick={() => nav(r.path)} className={cx(s.drawerItem, isActive(r, path) && s.drawerItemOn)}>
                <span>{r.navLabel}</span><span className={s.stepIdx}>{String(r.step).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <div className={s.drawerGroup}>
            <Eyebrow c={color.blueSoft} className={s.drawerLabel}>Explore</Eyebrow>
            {links.map((r) => {
              const bd = badge(r);
              return (
                <button key={r.path} onClick={() => nav(r.path)} className={cx(s.drawerItem, isActive(r, path) && s.drawerItemOn)}>
                  <span>{r.navLabel}</span>{bd > 0 && <span className={s.badge}>{bd}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {st.state === 'ready' && locOpen && <LocPanel close={() => setLocOpen(false)} />}
    </>
  );
}

function NavRight({ locOpen, toggleLoc }: { locOpen: boolean; toggleLoc: () => void }) {
  const d = useData();
  const go = useGo();
  const build = useRig((x) => x.build), region = useRig((x) => x.region);
  const L = useUserLoc();
  const reg = regionById(d, region);
  const req = requiredCats(d);
  const count = req.filter((c) => build[c.id]).length;
  const extras = d.categories.filter((c) => c.optional && build[c.id]).length;
  const total = useMemo(() => {
    if (!count && !extras) return fmt(0);
    const best = d.engine.plan(build, region, {}).best;
    return best.missing >= count + extras ? '—' : fmt(best.total);
  }, [d, build, region, count, extras]);
  const desc = describeLoc(L, reg.name, reg.short);
  return (
    <>
      <button onClick={toggleLoc} title="Set your location" aria-label={"Location: " + desc.short} aria-expanded={locOpen} className={cx(s.locBtn, locOpen && s.locBtnOn)}>
        <Dot c={desc.dot} size={7} ring />
        <span className={s.ellipsis}>{desc.short}</span>
      </button>
      <button onClick={() => go(ROUTES.cart.path)} className={s.cartBtn} aria-label={`Cart: ${count} of ${req.length} parts${extras ? ' plus ' + extras + ' extra' : ''}, ${total}`}>
        <span className={s.cartCount}>{count + '/' + req.length + (extras ? '+' + extras : '')}</span><span>{total}</span>
      </button>
    </>
  );
}

/** Tells the page-wipe when the router has committed a new pathname, so it reveals the new page, not the old one. */
function RouteCommit() {
  const path = usePathname();
  useEffect(() => { notifyRouteCommit(path); }, [path]);
  return null;
}

function Wipe() {
  const el = useRef<HTMLDivElement>(null), num = useRef<HTMLSpanElement>(null), lbl = useRef<HTMLSpanElement>(null);
  useEffect(() => { bindWipe(el.current, num.current, lbl.current); return () => bindWipe(null, null, null); }, []);
  return (
    <div ref={el} className={s.wipe} aria-hidden data-wipe="">
      <div className={s.wipeEdge} />
      <div className={s.wipeInner}><span ref={num} className={s.wipeNum} /><span ref={lbl} className={s.wipeLbl} style={type.display} /></div>
    </div>
  );
}

function Toast() {
  const el = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  useEffect(() => { bindToast(el.current, txt.current); return () => bindToast(null, null); }, []);
  return (
    <div ref={el} role="status" aria-live="polite" className={s.toast}>
      <span className={s.toastDot} />
      <span ref={txt} className={s.ellipsis} />
    </div>
  );
}
