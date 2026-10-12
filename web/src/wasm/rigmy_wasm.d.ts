/* tslint:disable */

import type { Build, Check, Choice, Eta, EtaDef, Offer, OpenState, Plan, Power, RegionId, UserLoc } from '../lib/types';
export interface NearbyBranch { branchId: string; km: number }
export interface LatLon { lat: number; lon: number }



export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Compatibility checks. `region` (default 'kv') prices the suggested fixes.
     */
    compat(build: Build, region?: RegionId): Check[];
    /**
     * Haversine distance in km between two `{lat, lon}` objects.
     */
    dist(a: LatLon, b: LatLon): number;
    /**
     * Worst-case working days for an ETA. Throws on an unknown label.
     */
    etaDays(eta: Eta): number;
    /**
     * Speed rank of an ETA (0 = fastest). Throws on an unknown label.
     */
    etaRank(eta: Eta): number;
    /**
     * The delivery-time table from `content.etas`, fastest first.
     */
    etas(): EtaDef[];
    fmtKm(km: number): string;
    /**
     * Cheapest available offer, or `null`.
     */
    lowest(productId: string, region: RegionId): Offer | null;
    /**
     * Slowest ETA among the chosen offers, ranked by `content.etas` (the fastest ETA when empty).
     */
    maxEta(choice: Choice): Eta;
    /**
     * All branches sorted by distance from `loc`.
     */
    nearby(loc: LatLon): NearbyBranch[];
    /**
     * `new Engine(JSON.stringify(bootstrap))`. Throws on invalid JSON or invalid `content`
     * (for example an ETA table that does not list every label exactly once).
     */
    constructor(bootstrapJson: string);
    /**
     * All listings for a product resolved for a delivery region, in retailer order.
     */
    offers(productId: string, region: RegionId): Offer[];
    /**
     * Opening state of a branch at `nowMs` (Malaysia time). Unknown branch -> "Hours not listed".
     */
    openState(branchId: string, nowMs: number): OpenState;
    /**
     * Purchase plan. `picks` maps productId -> retailerId for the custom strategy.
     */
    plan(build: Build, region: RegionId, picks?: Record<string, string>): Plan;
    /**
     * 5-digit Malaysian postcode -> approximate location from `bootstrap.postcodes`, or `null`.
     */
    postcode(pc: string): UserLoc | null;
    power(build: Build): Power;
    regionOf(lat: number, lon: number): RegionId;
    /**
     * Tracking link for a courier from `content.couriers`, or `undefined` when the courier is unknown
     * or has no `trackingUrl`. The tracking number is URL-encoded.
     */
    trackingUrl(courier: string, tracking: string): string | undefined;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_compat: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_dist: (a: number, b: number, c: number, d: number) => void;
    readonly engine_etaDays: (a: number, b: number, c: number, d: number) => void;
    readonly engine_etaRank: (a: number, b: number, c: number, d: number) => void;
    readonly engine_etas: (a: number, b: number) => void;
    readonly engine_fmtKm: (a: number, b: number, c: number) => void;
    readonly engine_lowest: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_maxEta: (a: number, b: number, c: number) => void;
    readonly engine_nearby: (a: number, b: number, c: number) => void;
    readonly engine_new: (a: number, b: number, c: number) => void;
    readonly engine_offers: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_openState: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_plan: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_postcode: (a: number, b: number, c: number, d: number) => void;
    readonly engine_power: (a: number, b: number, c: number) => void;
    readonly engine_regionOf: (a: number, b: number, c: number, d: number) => void;
    readonly engine_trackingUrl: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
