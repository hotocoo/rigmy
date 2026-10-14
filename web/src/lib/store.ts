'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Build, CatId, Order, PlanMode, RegionId, ShipMode, UserLoc } from './types';

export interface Checkout {
  step: number;
  name: string;
  phone: string;
  email: string;
  addr: string;
  city: string;
  postcode: string;
  ship: ShipMode;
  slotDay: number;
  slotWin: number;
  /** retailerId -> branchId for store pickup */
  pickup: Record<string, string>;
  err: string;
}

/** Maximum parts in a side-by-side comparison. */
export const COMPARE_LIMIT = 3;

export interface WatchItem { id: string; target: number; at: number }

export interface RigState {
  build: Build;
  region: RegionId;
  facet: string;
  sort: 'price' | 'desc' | 'name';
  previewId: string | null;
  compare: string[];
  cables: { route: 'tidy' | 'stock'; sleeve: 'black' | 'white' | 'blue' };
  cableHl: string | null;
  guideStep: number;
  planMode: PlanMode;
  /** productId -> retailerId */
  picks: Record<string, string>;
  co: Checkout;
  explode: number;
  sel: CatId | null;
  xray: boolean;
  loc: UserLoc | null;
  hRange: number;
  watch: WatchItem[];
  wDraft: Record<string, string>;
  notify: { email: boolean; whatsapp: boolean; push: boolean };
  trCat: 'all' | CatId;
  stRet: string;
  stOpen: boolean;
  stBuild: boolean;
  stSel: string | null;
  pBranch: string | null;
  /** Order numbers placed from this browser (orders themselves live in the API). */
  orders: string[];
  /** retailerId -> promo code the user holds for that shop (applied through the shop's own checkout). */
  promo: Record<string, string>;
  trackNo: string | null;
  /** Last placed order, kept for the confirmation page. */
  order: Order | null;
}

export interface RigActions {
  set: (p: Partial<RigState> | ((s: RigState) => Partial<RigState>)) => void;
  setCo: (p: Partial<Checkout>) => void;
  setPart: (cat: CatId, id: string) => void;
  removePart: (cat: CatId) => void;
  toggleCompare: (id: string, catOf: (id: string) => CatId | undefined) => void;
  addWatch: (id: string, target: number) => void;
  removeWatch: (id: string) => void;
}

export const DEF_CO: Checkout = {
  step: 0, name: '', phone: '', email: '', addr: '', city: '', postcode: '', ship: 'delivery', slotDay: 0, slotWin: 1, pickup: {}, err: '',
};

export const DEF: RigState = {
  build: {}, region: 'kv', facet: 'All', sort: 'price', previewId: null, compare: [], cables: { route: 'tidy', sleeve: 'black' }, cableHl: null,
  guideStep: 0, planMode: 'best', picks: {}, co: DEF_CO, explode: 0, sel: null, xray: false, loc: null, hRange: 90, watch: [], wDraft: {},
  notify: { email: true, whatsapp: true, push: false }, trCat: 'all', stRet: 'all', stOpen: false, stBuild: false, stSel: null, pBranch: null,
  orders: [], promo: {}, trackNo: null, order: null,
};

export const useRig = create<RigState & RigActions>()(
  persist(
    (set) => ({
      ...DEF,
      set: (p) => set((s) => (typeof p === 'function' ? p(s) : p)),
      setCo: (p) => set((s) => ({ co: { ...s.co, ...p } })),
      setPart: (cat, id) => set((s) => ({ build: { ...s.build, [cat]: id }, picks: {} })),
      removePart: (cat) => set((s) => { const b = { ...s.build }; delete b[cat]; return { build: b, sel: null }; }),
      toggleCompare: (id, catOf) => set((s) => {
        const cat = catOf(id);
        // Comparing needs one category of verified parts; market listings have no specs to compare.
        if (!cat) return {};
        let c = s.compare.filter((x) => catOf(x) === cat);
        if (c.includes(id)) c = c.filter((x) => x !== id); else { c.push(id); if (c.length > COMPARE_LIMIT) c.shift(); }
        return { compare: c };
      }),
      addWatch: (id, target) => set((s) => (target > 0 ? { watch: s.watch.filter((w) => w.id !== id).concat([{ id, target, at: Date.now() }]) } : {})),
      removeWatch: (id) => set((s) => ({ watch: s.watch.filter((w) => w.id !== id) })),
    }),
    {
      name: 'rigmy-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => {
        const rest = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as unknown as RigState;
        return { ...rest, co: { ...rest.co, err: '' } };
      },
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<RigState>;
        return { ...current, ...p, co: { ...DEF_CO, ...(p.co || {}), err: '' }, cables: { ...DEF.cables, ...(p.cables || {}) }, notify: { ...DEF.notify, ...(p.notify || {}) } };
      },
      skipHydration: true,
    },
  ),
);

/** Call once on the client (AppShell does it) so SSR markup matches the first client render. */
export const hydrateRig = () => useRig.persist.rehydrate();
