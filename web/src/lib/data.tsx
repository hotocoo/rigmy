'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { endpoint } from './routes';
import type {
  Bootstrap, Build, CatId, Category, Check, Choice, Eta, HistoryPoint, IndexPoint, Offer, OpenState, PartStats, Plan, Power,
  Product, RegionId, Retailer, Branch, UserLoc, EtaDef, SlotSwaps,
} from './types';

/** Typed facade over the Rust/WASM engine (crates/rigmy-wasm). */
export interface Engine {
  offers(productId: string, region: RegionId): Offer[];
  lowest(productId: string, region: RegionId): Offer | null;
  compat(build: Build): Check[];
  power(build: Build): Power;
  plan(build: Build, region: RegionId, picks: Record<string, string>): Plan;
  swaps(build: Build, region: RegionId): SlotSwaps[];
  regionOf(lat: number, lon: number): RegionId;
  postcode(pc: string): UserLoc | null;
  dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number;
  fmtKm(km: number): string;
  openState(branchId: string, nowMs: number): OpenState;
  nearby(loc: { lat: number; lon: number }): { branchId: string; km: number }[];
  maxEta(choice: Choice): Eta;
  etas(): EtaDef[];
  etaRank(eta: Eta): number;
  etaDays(eta: Eta): number;
  trackingUrl(courier: string, tracking: string): string | undefined;
}

export interface Data extends Bootstrap {
  engine: Engine;
  byId: Record<string, Product>;
  retailerById: Record<string, Retailer>;
  branchById: Record<string, Branch>;
  cat: (id: CatId) => Category;
}

type Status = { state: 'loading' } | { state: 'error'; error: string } | { state: 'ready'; data: Data };

const Ctx = createContext<Status>({ state: 'loading' });

async function loadEngine(boot: Bootstrap): Promise<Engine> {
  const mod = await import('@/wasm/rigmy_wasm.js');
  await mod.default({ module_or_path: new URL('../wasm/rigmy_wasm_bg.wasm', import.meta.url) });
  return new mod.Engine(JSON.stringify(boot)) as unknown as Engine;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<Status>({ state: 'loading' });
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch(endpoint.bootstrap);
        if (!r.ok) throw new Error('API responded ' + r.status);
        const boot = (await r.json()) as Bootstrap;
        const engine = await loadEngine(boot);
        const byId = Object.fromEntries(boot.products.map((p) => [p.id, p]));
        const retailerById = Object.fromEntries(boot.retailers.map((p) => [p.id, p]));
        const branchById = Object.fromEntries(boot.branches.map((p) => [p.id, p]));
        const cats = Object.fromEntries(boot.categories.map((c) => [c.id, c])) as Record<CatId, Category>;
        if (!dead) setSt({ state: 'ready', data: { ...boot, engine, byId, retailerById, branchById, cat: (id) => cats[id] } });
      } catch (e) {
        if (!dead) setSt({ state: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { dead = true; };
  }, []);
  return <Ctx.Provider value={st}>{children}</Ctx.Provider>;
}

export const useDataStatus = () => useContext(Ctx);
/** Only call below <DataGate>, which guarantees the data is ready. */
export function useData(): Data {
  const s = useContext(Ctx);
  if (s.state !== 'ready') throw new Error('useData() used outside <DataGate>');
  return s.data;
}

// ---------- lazily fetched market data ----------
function useJson<T>(url: string | null): T | null {
  const [v, setV] = useState<{ url: string; data: T } | null>(null);
  useEffect(() => {
    if (!url) return;
    let dead = false;
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!dead && d) setV({ url, data: d as T }); }).catch(() => {});
    return () => { dead = true; };
  }, [url]);
  return v && v.url === url ? v.data : null;
}

/** Stats for every product (null while loading). */
export const useStats = () => useJson<Record<string, PartStats>>(endpoint.stats);
export const useHistory = (id: string | null) => useJson<HistoryPoint[]>(id ? endpoint.history(id) : null);
export const useIndex = (cat: string) => useJson<IndexPoint[]>(endpoint.index(cat));

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || 'Request failed (' + r.status + ')');
  return j as T;
}

/** Memoised helper for the products of a build, in category order. */
export function useBuildParts(build: Build) {
  const d = useData();
  return useMemo(() => d.categories.map((c) => (build[c.id] ? d.byId[build[c.id]!] : null)).filter((p): p is Product => !!p), [d, build]);
}
