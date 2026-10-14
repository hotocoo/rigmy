// Domain types shared by the Next.js app, the Rust API (serde camelCase) and the WASM engine.
// This file is the contract: crates/rigmy-core mirrors every shape here.

export type CatId = 'cpu' | 'cooler' | 'mobo' | 'ram' | 'ssd' | 'gpu' | 'case' | 'psu' | 'ssd2' | 'monitor' | 'fans';
/** Category of the products a build slot takes: the second storage slot takes any SSD. */
export const productCat = (slot: CatId): CatId => (slot === 'ssd2' ? 'ssd' : slot);
export type RegionId = 'kv' | 'pen' | 'jhr' | 'east';
export type Eta = 'Same day' | 'Next day' | '1–2 days' | '2–3 days' | '3–5 days' | '5–7 days';
export type Tone = 'ok' | 'warn' | 'error' | 'pending' | 'info';
export type Build = Partial<Record<CatId, string>>;

export interface LatLon { lat: number; lon: number }
/** A delivery/price region. `center` is used as the approximate user position until they share a location. */
export interface Region { id: RegionId; name: string; short: string; center: LatLon & { label: string } }
/** `optional`: an extra slot a build is complete without (second drive, monitor, case fans). */
export interface Category { id: CatId; label: string; long: string; idx: string; optional?: boolean }
/** [specKey, label, unit?, better?] — better is 'high' | 'low' for comparison highlighting. */
export type SpecDef = [string, string, string?, ('high' | 'low')?];

export interface Product {
  id: string;
  /**
   * Build slot. Absent for market listings — products discovered from retailer
   * feeds that were not verified into the catalog. Market listings carry
   * price/stock/history only and can never enter a build (no specs to check).
   */
  cat?: CatId;
  /** Retailer category label for market listings, e.g. "Keyboard". */
  market?: string;
  brand: string;
  name: string;
  glyph: string;
  short?: string;
  facet: string;
  /** Manufacturer warranty in years, 99 = lifetime. */
  warrantyY: number;
  specs: Record<string, string | number>;
  // compatibility-relevant fields (present per category)
  socket?: string;
  tdp?: number;
  ff?: string;
  mem?: string;
  ffs?: string[];
  maxGpu?: number;
  maxCooler?: number;
  radTop?: number;
  ctype?: 'aio' | 'air';
  rad?: number;
  height?: number;
  maxTdp?: number;
  length?: number;
  tgp?: number;
  watt?: number;
  /** Hints for the 3D studio (dimensions in metres, colours, fan count…). */
  vis: Record<string, unknown>;
  /** 'listing' = buildable part whose specs were read from a retailer listing title, not the verified catalogue. */
  source?: 'listing';
}

/** A verified, buildable catalogue part (as opposed to a market listing, which has no `cat`). */
export type CatalogPart = Product & { cat: CatId };

/** Type guard: true for verified catalogue parts, false for market listings. */
export const isCatalogPart = (p: Product): p is CatalogPart => !!p.cat;

export interface Delivery { fee: number; eta: Eta }
export interface Retailer {
  id: string;
  name: string;
  city: string;
  website: string;
  /** Payment methods the retailer accepts, free text from config. */
  pay: string;
  /** e.g. "Pickup · Bukit Bintang" or "Online only". */
  pickup: string;
  /** Per-region delivery terms from config; a missing region means the retailer does not ship there. */
  delivery: Partial<Record<RegionId, Delivery>>;
  /** Default courier name used for tracking links. */
  courier?: string;
  /** Storefront platform when known; Shopify shops accept promo codes through `/discount/<code>` links. */
  platform?: 'shopify' | 'woocommerce';
}

export type StockState = 'In stock' | 'Low stock' | 'Pre-order' | 'Out of stock' | 'Unknown';

/** Latest observed listing, as written by the ingester. */
export interface RawOffer {
  productId: string;
  retailerId: string;
  price: number;
  stock: StockState;
  url: string;
  /** ISO timestamp of the observation. */
  observedAt: string;
}

/** RawOffer resolved for a delivery region (computed by the engine). */
export interface Offer extends RawOffer {
  avail: boolean;
  /** null = retailer does not deliver to this region. */
  fee: number | null;
  eta: Eta | null;
  /** Display status, e.g. 'In stock' or 'No delivery'. */
  status: string;
  warranty: string;
}

export interface WeekHours {
  /** Index 0 = Sunday. [openHour, closeHour] in local hours (fractions allowed), null = closed. */
  week: ([number, number] | null)[];
}
export interface Branch {
  id: string;
  retailerId: string;
  name: string;
  addr: string;
  lat: number;
  lon: number;
  phone?: string;
  hours: WeekHours | null;
  /** Original opening_hours string from OSM / config. */
  hoursRaw?: string;
  services: string[];
  source: 'osm' | 'config';
}

export interface SaleEvent { t: number; label: string }

export interface HistoryPoint {
  /** Day start, ms since epoch (Asia/Kuala_Lumpur). */
  t: number;
  /** Lowest in-stock price across retailers that day. */
  low: number;
  /** Average in-stock price across retailers that day. */
  avg: number;
  ev?: string | null;
  sale?: boolean;
}

export interface PartStats {
  cur: number | null;
  low: number | null;
  lowT: number | null;
  high: number | null;
  avg90: number | null;
  /** Fractional change, null when there is not enough history yet. */
  d7: number | null;
  d30: number | null;
  verdict: string;
  tone: Tone;
  next: SaleEvent | null;
  nextIn: number | null;
  /** Number of saved/shared builds that include the part. */
  builds: number;
  /** Days of price history available. */
  days: number;
  score: number;
  /** Last 60 daily lows for sparklines. */
  spark: number[];
}

export interface IndexPoint { t: number; v: number; ev?: string | null }

export interface Fix { cat: CatId; id: string; text: string }
export interface Check {
  id: 'socket' | 'mem' | 'ff' | 'gpu' | 'cool' | 'therm' | 'psu';
  label: string;
  value: string;
  status: Tone;
  parts: CatId[];
  detail: string;
  fix: Fix | null;
}

export interface Power { est: number; rec: number; psu: number }

export type Choice = Record<string, Offer | null>;
export interface PlanTotal {
  parts: number;
  fee: number;
  total: number;
  shops: number;
  missing: number;
  /** Retailers whose delivery fee is unknown for the region. */
  unknownFees: number;
  choice: Choice;
}
export interface ShopTotal extends PlanTotal { rid: string; retailer: Retailer }

/** One priced alternative for a build slot, from `engine.swaps`. */
export interface SwapOption {
  id: string;
  /** Lowest available price in the region; absent when the part has no usable offer. */
  price?: number;
}

/** Other catalogue parts that fit a filled slot without breaking compatibility.
 *  Not a quality ranking — priced alternatives for the user to judge. */
export interface SlotSwaps {
  cat: CatId;
  current: string;
  /** Priced ascending, unpriced last; the current part is excluded. */
  options: SwapOption[];
}
export interface PlanRow { p: Product; offers: Offer[] }
export interface Plan {
  rows: PlanRow[];
  best: PlanTotal;
  fast: PlanTotal;
  single: PlanTotal & { rid?: string; retailer?: Retailer };
  custom: PlanTotal;
  shopTotals: ShopTotal[];
}
export type PlanMode = 'best' | 'fast' | 'single' | 'custom';

/** `featured` marks the preset shown on the home page / offered as a starting point (exactly one should be featured). */
export interface Preset { id: string; name: string; tier: string; note: string; build: Build; featured?: boolean }

// ---------- editorial / reference content (config/content.toml) ----------
/** Delivery-time bucket: `rank` orders them, `days` is the worst-case working days used for scheduling. */
export interface EtaDef { label: Eta; rank: number; days: number }
export interface GuideStepDef {
  /** Part the step installs; 'cables' for cable routing; null for the final close-up step. */
  cat: CatId | 'cables' | null;
  title: string;
  minutes: number;
  text: string;
}
export interface CableRunDef {
  /** Matches the studio's cable mesh ids (cable_24pin, cable_eps, cable_gpu, cable_fp). */
  id: string;
  name: string;
  conn: string;
  lengthMm: number;
  /** The run only exists when this part is in the build. */
  requires: CatId;
  /** Route description for managed ("tidy") and as-shipped ("stock") cabling. */
  tidy: string;
  stock: string;
}
export interface Courier {
  name: string;
  /** Public tracking page with a `{tracking}` placeholder; absent when no stable public URL is known. */
  trackingUrl?: string;
}
export interface Content {
  etas: EtaDef[];
  /** Delivery time windows the user can ask for at checkout, e.g. "9 am – 12 pm". */
  deliveryWindows: string[];
  /** How many consecutive days the delivery-day picker offers. */
  slotDays: number;
  /** Delivery-fee multiplier per category for bulky parts (e.g. `case: 2`); unlisted categories use 1. */
  deliverySizeMultiplier: Partial<Record<CatId, number>>;
  guide: GuideStepDef[];
  cableRuns: CableRunDef[];
  couriers: Courier[];
}

export interface UserLoc {
  lat: number;
  lon: number;
  label: string;
  source: 'gps' | 'postcode' | 'region';
  acc: number;
  postcode?: string;
  city?: string;
  road?: string;
  region?: RegionId;
}

export interface OpenState { open: boolean; text: string; closing?: boolean; unknown?: boolean }

/** Everything the client needs on first load: GET /api/bootstrap */
export interface Bootstrap {
  regions: Region[];
  categories: Category[];
  specdef: Record<CatId, SpecDef[]>;
  facet: Record<CatId, string>;
  products: Product[];
  retailers: Retailer[];
  branches: Branch[];
  offers: RawOffer[];
  events: SaleEvent[];
  presets: Preset[];
  content: Content;
  /** 2-digit postcode prefix -> town centroid (config/postcodes.toml); used by `engine.postcode()`. */
  postcodes: { prefix: string; town: string; lat: number; lon: number }[];
  /** ISO timestamp of the most recent ingest run, null if never run. */
  lastIngest: string | null;
}

// ---------- orders (retailer hand-off) ----------
export type ShipMode = 'delivery' | 'pickup';
export interface OrderItem { productId: string; name: string; cat: CatId; price: number; url: string }
export interface OrderGroup {
  retailerId: string;
  name: string;
  items: OrderItem[];
  fee: number | null;
  eta: Eta | null;
  branchId?: string | null;
  /** Filled in by the user after buying at the retailer. */
  status: 'to-buy' | 'purchased' | 'shipped' | 'ready' | 'received';
  courier?: string | null;
  tracking?: string | null;
}
export interface Order {
  no: string;
  placedAt: number;
  region: RegionId;
  ship: ShipMode;
  contact: { name: string; phone: string; email: string };
  addr: { line: string; postcode: string; city: string } | null;
  slot: { day: number; window: string } | null;
  groups: OrderGroup[];
  total: number;
}
export type NewOrder = Omit<Order, 'no' | 'placedAt'>;

export interface SavedBuild { id: string; name: string; build: Build; region: RegionId; createdAt: number }

/** A published build in `GET /api/gallery`; `title` falls back to the build name. */
export interface GalleryBuild { id: string; title: string; note: string | null; region: RegionId; createdAt: number; parts: Build; partCount: number }
export interface GalleryPage { builds: GalleryBuild[]; nextCursor: string | null }
