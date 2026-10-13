'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/shell/motion';
import { regionCenter, useRegion } from './content';
import { useData } from './data';
import { digits } from './format';
import { useRig } from './store';
import { color, tone } from './tokens';
import type { UserLoc } from './types';

/** The user's position: GPS / postcode if set, else the centre of the chosen price region. */
export function useUserLoc(): UserLoc {
  const d = useData();
  const loc = useRig((s) => s.loc), region = useRig((s) => s.region);
  if (loc && loc.lat != null) return loc;
  const c = regionCenter(d, region);
  return { lat: c.lat, lon: c.lon, label: c.label, source: 'region', acc: REGION_ACCURACY_M };
}

/** Accuracy reported for a region-centre position (roughly the radius of a metro area). */
const REGION_ACCURACY_M = 15000;

type Fill = { addr: string; postcode: string; city: string };

/** Browser geolocation + OpenStreetMap Nominatim reverse geocoding (real address lookup). */
export function useLocate() {
  const { engine } = useData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const locate = useCallback((onFill?: (f: Fill) => void) => {
    if (!navigator.geolocation) { setMsg('This browser cannot share its location. Enter your postcode instead.'); return; }
    setBusy(true); setMsg('');
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = Math.round(pos.coords.accuracy || 50);
      useRig.getState().set({ loc: { lat, lon, acc, source: 'gps', label: 'Your location', postcode: '' }, region: engine.regionOf(lat, lon) });
      setBusy(false);
      toast('Location set · accurate to ' + acc + ' m');
      fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=' + lat + '&lon=' + lon, { headers: { 'Accept-Language': 'en' } })
        .then((r) => r.json())
        .then((j: { address?: Record<string, string> }) => {
          const a = j.address || {};
          const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.city || a.village || a.county || 'Your location';
          const city = a.city || a.town || a.municipality || a.county || a.state || '', road = [a.house_number, a.road].filter(Boolean).join(', ');
          useRig.getState().set((st) => ({ loc: st.loc ? { ...st.loc, label: area, postcode: a.postcode || '', city, road } : st.loc }));
          onFill?.({ addr: road || area, postcode: a.postcode || '', city: city || area });
        })
        .catch(() => {});
    }, (err) => {
      setBusy(false);
      setMsg(err.code === 1 ? 'Location access is blocked for this page. Enter your postcode instead.' : 'Could not get a fix on your location. Enter your postcode instead.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }, [engine]);
  const setPostcode = useCallback((pc: string) => {
    const l = engine.postcode(pc);
    if (!l) { setMsg(POSTCODE_HINT); return false; }
    useRig.getState().set({ loc: l, region: l.region || engine.regionOf(l.lat, l.lon) });
    setMsg('');
    toast('Location set to ' + l.label + ' ' + l.postcode);
    return true;
  }, [engine]);
  return { locate, setPostcode, busy, msg, setMsg };
}

/** Malaysian postcodes are five digits. */
export const POSTCODE_LEN = 5;
/** What to type when a postcode is not recognised. */
export const POSTCODE_HINT = 'Enter a ' + POSTCODE_LEN + '-digit Malaysian postcode, for example 47300.';
/** Keeps only the digits of a postcode being typed, capped at its length. */
export const cleanPostcode = (v: string) => digits(v).slice(0, POSTCODE_LEN);

/** Turn-by-turn directions to a coordinate (Google Maps URL scheme: no API key, opens the maps app on phones). */
export const directionsUrl = (lat: number, lon: number) => 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon;

/** Shared wording + status colour for the user's location (nav button, location panel, page location bars). */
export function describeLoc(L: UserLoc, regionName: string, regionShort: string) {
  const src = L.source;
  return {
    label: L.label + (L.postcode && src !== 'region' ? ' ' + L.postcode : ''),
    short: src === 'region' ? 'Set location · ' + regionShort : L.label,
    meta: src === 'gps' ? 'Exact location · accurate to ' + L.acc + ' m · ' + regionName + ' prices'
      : src === 'postcode' ? 'From postcode ' + L.postcode + ' · ' + regionName + ' prices'
        : 'Approximate · centre of ' + regionName + ' · set your location for exact distances',
    dot: src === 'gps' ? tone.ok : src === 'postcode' ? color.blue : tone.warn,
  };
}

/** The user's position with its wording for the current price region (see describeLoc). */
export function useLocDescription() {
  const L = useUserLoc();
  const reg = useRegion();
  return { L, ...describeLoc(L, reg.name, reg.short) };
}
