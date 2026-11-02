// Pure geography helpers. No DOM, no L, no fetch, no clock.

export const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function normalizeLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === 180) l = -180;
  return l;
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(lat, lon, bearing, km) {
  const δ = km / EARTH_RADIUS_KM;
  const θ = toRad(bearing);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

export function inBounds(lat, lon, b) {
  if (!b) return false;
  const latOk = lat >= b.south && lat <= b.north;
  let lonOk;
  if (b.west > b.east) {
    lonOk = lon >= b.west || lon <= b.east; // box crosses the antimeridian
  } else {
    lonOk = lon >= b.west && lon <= b.east;
  }
  return latOk && lonOk;
}

export function splitAtAntimeridian(points) {
  const segments = [];
  let current = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && Math.abs(points[i][1] - points[i - 1][1]) > 180) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function formatAgo(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}
