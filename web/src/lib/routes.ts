/**
 * Route registry — the single source for every page's path, nav placement and page-wipe label.
 * Nav, the page transition and links all derive from this table.
 */
export interface RouteDef {
  path: string;
  /** Wipe label: [kicker, title]. */
  wipe: [string, string];
  /** Present in the numbered build flow (01–05) shown in the nav. */
  step?: number;
  /** Present in the nav's secondary links, in this order. */
  link?: number;
  navLabel?: string;
  /** Only show the nav link when the user has orders. */
  needsOrders?: boolean;
  /** Paths that should highlight this nav entry as well. */
  alias?: string[];
}

export const ROUTES = {
  home: { path: '/', wipe: ['00 · Start', 'RigMY'] },
  build: { path: '/build', wipe: ['01 · Step', 'Build'], step: 1, navLabel: 'Build' },
  review: { path: '/review', wipe: ['02 · Step', 'Review'], step: 2, navLabel: 'Review' },
  prices: { path: '/prices', wipe: ['03 · Step', 'Prices'], step: 3, navLabel: 'Prices' },
  cart: { path: '/cart', wipe: ['04 · Step', 'Cart'], step: 4, navLabel: 'Cart' },
  checkout: { path: '/checkout', wipe: ['05 · Step', 'Checkout'], step: 5, navLabel: 'Checkout' },
  order: { path: '/order', wipe: ['06 · Done', 'Order placed'] },
  parts: { path: '/parts', wipe: ['Catalogue', 'Parts'], link: 1, navLabel: 'Parts', alias: ['/part'] },
  part: { path: '/part', wipe: ['Catalogue', 'Prices and stock'] },
  trending: { path: '/trending', wipe: ['Market', 'Trending'], link: 2, navLabel: 'Trending' },
  stores: { path: '/stores', wipe: ['Near you', 'Stores'], link: 3, navLabel: 'Stores' },
  compare: { path: '/compare', wipe: ['Catalogue', 'Compare'], link: 4, navLabel: 'Compare' },
  watchlist: { path: '/watchlist', wipe: ['Market', 'Watchlist'], link: 5, navLabel: 'Watchlist' },
  guide: { path: '/guide', wipe: ['Build', 'Build guide'], link: 6, navLabel: 'Guide' },
  gallery: { path: '/gallery', wipe: ['Community', 'Completed builds'], link: 7, navLabel: 'Gallery' },
  orders: { path: '/orders', wipe: ['Orders', 'Tracking'], link: 8, navLabel: 'Orders', needsOrders: true },
  cables: { path: '/cables', wipe: ['Build', 'Cables'] },
  shared: { path: '/b', wipe: ['Shared', 'Build'] },
} as const satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof ROUTES;
const ALL: RouteDef[] = Object.values(ROUTES);

export const href = {
  part: (id: string) => ROUTES.part.path + '/' + encodeURIComponent(id),
  parts: (cat?: string) => ROUTES.parts.path + (cat ? '/' + cat : ''),
  order: (no: string) => ROUTES.order.path + '/' + encodeURIComponent(no),
  shared: (id: string) => ROUTES.shared.path + '/' + encodeURIComponent(id),
};

/** Paths of the RigMY API (crates/rigmy-api), proxied under the site origin. */
const API = '/api';
/** Builds per gallery request (the API allows up to 50). */
const GALLERY_PAGE = 24;
const seg = (x: string) => '/' + encodeURIComponent(x);
export const endpoint = {
  bootstrap: API + '/bootstrap',
  stats: API + '/stats',
  history: (productId: string) => API + '/products' + seg(productId) + '/history',
  index: (cat: string) => API + '/index?cat=' + encodeURIComponent(cat),
  builds: API + '/builds',
  build: (id: string) => API + '/builds' + seg(id),
  gallery: (cursor?: string | null) => API + '/gallery?limit=' + GALLERY_PAGE + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
  orders: API + '/orders',
  order: (no: string) => API + '/orders' + seg(no),
  orderGroup: (no: string, retailerId: string) => API + '/orders' + seg(no) + '/groups' + seg(retailerId),
};

/** First path segment, e.g. '/part/x' -> '/part'. */
export const section = (path: string) => '/' + (path.split('?')[0].split('/')[1] || '');

/** Wipe label for any concrete path. */
export function wipeLabel(path: string): [string, string] {
  const p = path.split('?')[0];
  const r = ALL.find((x) => x.path === p) || ALL.find((x) => x.path === section(p));
  return r ? [...r.wipe] as [string, string] : ['', p];
}

export const stepRoutes = () => ALL.filter((r) => r.step).sort((a, b) => a.step! - b.step!);
export const linkRoutes = () => ALL.filter((r) => r.link).sort((a, b) => a.link! - b.link!);
export const isActive = (r: RouteDef, path: string) => section(path) === r.path || (r.alias || []).includes(section(path));
