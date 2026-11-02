// Earthquake helpers. Pure logic only.

import { haversineKm } from './geo.js';

export function parseQuakes(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return [];
  const out = [];
  for (const f of geojson.features) {
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') continue;
    const p = f.properties || {};
    out.push({
      id: f.id,
      mag: p.mag == null ? 0 : p.mag,
      place: p.place || 'Unknown',
      time: p.time || 0,
      url: p.url || '',
      lat: coords[1],
      lon: coords[0],
      depthKm: typeof coords[2] === 'number' ? coords[2] : null,
      tsunami: p.tsunami === 1
    });
  }
  return out;
}

export function quakeRadiusPx(mag) {
  return Math.min(30, Math.max(4, 4 + mag * 3));
}

export function quakeColor(mag) {
  if (mag < 2.5) return '#3ecf8e';
  if (mag < 4.5) return '#f5c542';
  if (mag < 6) return '#ff8c42';
  return '#ff4d4f';
}

export function filterQuakes(list, { minMag = 0, sinceMs = 0 } = {}) {
  return list.filter((q) => q.mag >= minMag && q.time >= sinceMs);
}

export function sortByMag(list) {
  return [...list].sort((a, b) => b.mag - a.mag);
}

export function strongest(list) {
  let best = null;
  for (const q of list) {
    if (!best || q.mag > best.mag) best = q;
  }
  return best;
}

export function quakeStats(list) {
  const countAbove = { 2.5: 0, 4.5: 0, 6: 0 };
  for (const q of list) {
    if (q.mag >= 2.5) countAbove[2.5]++;
    if (q.mag >= 4.5) countAbove[4.5]++;
    if (q.mag >= 6) countAbove[6]++;
  }
  return { count: list.length, maxMag: strongest(list)?.mag ?? 0, strongest: strongest(list), countAbove };
}

export function quakesNear(list, lat, lon, km) {
  return list
    .map((q) => ({ ...q, distanceKm: haversineKm(lat, lon, q.lat, q.lon) }))
    .filter((q) => q.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
