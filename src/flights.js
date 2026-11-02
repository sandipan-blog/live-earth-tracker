// Flight helpers. Pure logic only.

import { haversineKm, destinationPoint, inBounds } from './geo.js';

export function parseFlights(json) {
  if (!json || !Array.isArray(json.states)) return [];
  const out = [];
  for (const s of json.states) {
    if (!s) continue;
    const lon = s[5];
    const lat = s[6];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const callsign = typeof s[1] === 'string' ? s[1].trim() : '';
    out.push({
      icao24: s[0],
      callsign: callsign === '' ? null : callsign,
      country: s[2] || null,
      lat,
      lon,
      altM: s[13] != null ? s[13] : s[7], // geo_altitude, else baro_altitude
      onGround: s[8] === true,
      speedKmh: s[9] == null ? null : s[9] * 3.6,
      heading: s[10],
      verticalRate: s[11],
      lastContact: (s[4] || 0) * 1000
    });
  }
  return out;
}

export function flightLabel(f) {
  return f.callsign || String(f.icao24).toUpperCase();
}

export function filterFlights(list, { bounds, airborneOnly = true } = {}) {
  return list.filter((f) => {
    if (airborneOnly && f.onGround) return false;
    if (bounds && !inBounds(f.lat, f.lon, bounds)) return false;
    return true;
  });
}

export function limitFlights(list, max = 400, centre = { lat: 0, lon: 0 }) {
  if (list.length <= max) return [...list];
  return [...list]
    .sort(
      (a, b) =>
        haversineKm(centre.lat, centre.lon, a.lat, a.lon) -
        haversineKm(centre.lat, centre.lon, b.lat, b.lon)
    )
    .slice(0, max);
}

export function flightStats(list) {
  let airborne = 0;
  let onGround = 0;
  const byCountry = new Map();
  for (const f of list) {
    if (f.onGround) onGround++;
    else airborne++;
    if (f.country) byCountry.set(f.country, (byCountry.get(f.country) || 0) + 1);
  }
  const topCountries = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return { count: list.length, airborne, onGround, topCountries };
}

export function extrapolateFlight(f, dtMs) {
  if (dtMs > 120000) return f;
  if (f.onGround) return f;
  if (typeof f.speedKmh !== 'number' || typeof f.heading !== 'number') return f;
  const km = (f.speedKmh * dtMs) / 3600000;
  const p = destinationPoint(f.lat, f.lon, f.heading, km);
  return { ...f, lat: p.lat, lon: p.lon };
}

export function boundsToQuery(b) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r = (v) => clamp(v, -180, 180).toFixed(2);
  const lat = (v) => clamp(v, -90, 90).toFixed(2);
  return `lamin=${lat(b.south)}&lomin=${r(b.west)}&lamax=${lat(b.north)}&lomax=${r(b.east)}`;
}
