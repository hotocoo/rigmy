'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LMap, Marker, Circle, Polyline } from 'leaflet';
import { useEffect, useRef } from 'react';
import { cx } from '@/lib/cx';
import type { StockTone } from '@/lib/format';
import { color, ease } from '@/lib/tokens';
import css from './StoreMap.module.css';

/** Pin colour: a stock tone (`none` = the shop does not say). */
export type PinTone = StockTone;
export interface MapPin { id: string; name: string; lat: number; lon: number; tone: PinTone; sub?: string; km?: string; d?: number | null; near?: boolean }
export interface MapData { branches: MapPin[]; user: { lat: number; lon: number; acc: number } | null; sel: string | null; focus?: 'near' | 'all' }

const PIN_COLOR: Record<PinTone, string> = { ok: color.ok, warn: color.warn, error: color.error, info: color.info, none: color.fg3 };
/** Leaflet draws vectors as SVG attributes, which cannot resolve CSS variables, so read the token's computed value. */
const cssVar = (name: string) => (typeof window === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim());
let BLUE = '';
/** Length of the scan sweep that runs whenever the map reframes. */
const SCAN_MS = 1300;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Dark OpenStreetMap store map (port of the prototype's store-map.html): glowing pins with hover labels,
 * pulsing "you are here" marker + accuracy circle, dashed distance line + km tag to the selected store,
 * fly-to on selection and a blue scan sweep whenever the framing changes.
 */
export function StoreMap({ data, onPick, className, style }: { data: MapData; onPick?: (id: string) => void; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLDivElement>(null), scanRef = useRef<HTMLDivElement>(null);
  const st = useRef<{ L: typeof import('leaflet'); map: LMap; pins: Record<string, Marker>; me: Marker | null; acc: Circle | null; line: Polyline | null; kmTag: Marker | null; sel: string | null; fitted: string } | null>(null);
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);
  const latest = useRef(data);

  function scan() {
    const s = scanRef.current, h = box.current?.clientHeight || 400;
    s?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(' + (h + 240) + 'px)' }], { duration: SCAN_MS, easing: ease.scan });
  }

  function icon(L: typeof import('leaflet'), b: MapPin, sel: boolean) {
    return L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="' + css.pin + (sel ? ' ' + css.sel : '') + '" style="--c:' + PIN_COLOR[b.tone] + '"><i></i><b>' + esc(b.name) + (b.sub ? '<em>' + esc(b.sub) + '</em>' : '') + '</b></div>' });
  }

  function render(d: MapData) {
    const s = st.current;
    if (!s) return;
    const { L, map } = s, prevSel = s.sel;
    const ids = new Set(d.branches.map((b) => b.id));
    for (const id in s.pins) if (!ids.has(id)) { map.removeLayer(s.pins[id]); delete s.pins[id]; }
    d.branches.forEach((b) => {
      if (!s.pins[b.id]) { s.pins[b.id] = L.marker([b.lat, b.lon], { icon: icon(L, b, b.id === d.sel), riseOnHover: true }).addTo(map); s.pins[b.id].on('click', () => pick.current?.(b.id)); }
      else s.pins[b.id].setIcon(icon(L, b, b.id === d.sel));
      s.pins[b.id].setZIndexOffset(b.id === d.sel ? 1000 : 0);
    });
    if (d.user) {
      const ll: [number, number] = [d.user.lat, d.user.lon];
      if (!s.me) {
        s.me = L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="' + css.me + '"><i></i></div>' }), interactive: false, zIndexOffset: 2000 }).addTo(map);
        s.acc = L.circle(ll, { radius: d.user.acc || 50, color: BLUE, weight: 1, opacity: 0.5, fillColor: BLUE, fillOpacity: 0.08, interactive: false }).addTo(map);
      } else { s.me.setLatLng(ll); s.acc?.setLatLng(ll); s.acc?.setRadius(Math.min(d.user.acc || 50, 5000)); }
    }
    if (s.line) { map.removeLayer(s.line); s.line = null; }
    if (s.kmTag) { map.removeLayer(s.kmTag); s.kmTag = null; }
    const sb = d.branches.find((b) => b.id === d.sel);
    if (sb && d.user) {
      s.line = L.polyline([[d.user.lat, d.user.lon], [sb.lat, sb.lon]], { color: BLUE, weight: 2, opacity: 0.9, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
      if (sb.km) s.kmTag = L.marker([(d.user.lat + sb.lat) / 2, (d.user.lon + sb.lon) / 2], { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="' + css.km + '">' + esc(sb.km) + '</div>' }), interactive: false }).addTo(map);
    }
    s.sel = d.sel;
    if (sb && sb.id !== prevSel) {
      const pts: [number, number][] = [[sb.lat, sb.lon]];
      if (d.user && sb.near) pts.push([d.user.lat, d.user.lon]);
      if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts).pad(0.45), { duration: 1.1, maxZoom: 15 }); else map.flyTo([sb.lat, sb.lon], 14, { duration: 1.1 });
    } else if (!sb) {
      const key = (d.user ? d.user.lat.toFixed(3) + d.user.lon.toFixed(3) : 'x') + '|' + d.branches.length + '|' + (d.focus || '');
      if (key !== s.fitted) {
        s.fitted = key;
        let pts: [number, number][] = d.branches.map((b) => [b.lat, b.lon]);
        if (d.user && d.focus === 'near') pts = d.branches.slice().sort((a, b) => (a.d || 0) - (b.d || 0)).slice(0, 4).map((b) => [b.lat, b.lon] as [number, number]).concat([[d.user.lat, d.user.lon]]);
        else if (!pts.length && d.user) pts = [[d.user.lat, d.user.lon]];
        if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts).pad(0.25), { duration: 1.4, maxZoom: 13 });
        else if (pts.length === 1) map.flyTo(pts[0], 11, { duration: 1.4 });
        scan();
      }
    }
  }

  useEffect(() => {
    let dead = false, ro: ResizeObserver | null = null;
    import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: typeof import('leaflet') }).default || mod;
      if (dead || !box.current) return;
      BLUE = cssVar('--blue');
      const map = L.map(box.current, { zoomControl: true, attributionControl: true, zoomSnap: 0.25 }).setView([4.2, 108.5], 5.5);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      st.current = { L, map, pins: {}, me: null, acc: null, line: null, kmTag: null, sel: null, fitted: '' };
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(box.current);
      render(latest.current);
    });
    return () => { dead = true; ro?.disconnect(); st.current?.map.remove(); st.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { latest.current = data; render(data); });

  return (
    <div className={cx(css.wrap, className)} style={style}>
      <div ref={box} className={css.map} />
      <div className={css.fx} />
      <div ref={scanRef} className={css.scan} />
    </div>
  );
}
