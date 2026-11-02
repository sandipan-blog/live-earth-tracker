// ISS helpers. Pure logic only.

import { haversineKm, formatLatLon } from './geo.js';
import { nearestCity } from './cities.js';

export function parseIss(json) {
  return {
    lat: json.latitude,
    lon: json.longitude,
    altKm: json.altitude,
    speedKmh: json.velocity,
    visibility: json.visibility || null,
    time: json.timestamp * 1000 // seconds -> milliseconds
  };
}

export function createTrail(maxPoints = 300) {
  let points = [];
  return {
    add(pos) {
      if (points.length > 0 && pos.time === points[points.length - 1].time) return;
      points.push(pos);
      if (points.length > maxPoints) points = points.slice(-maxPoints);
    },
    points() {
      return [...points];
    },
    clear() {
      points = [];
    }
  };
}

export function futureTimestamps(nowMs, minutes = 90, stepMin = 1) {
  const out = [];
  for (let m = 1; m <= minutes; m += stepMin) {
    out.push(Math.floor((nowMs + m * 60 * 1000) / 1000));
  }
  return out;
}

export function chunk(list, size = 10) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function findPasses(predicted, city, radiusKm = 1000) {
  const passes = [];
  let current = null;
  for (const p of predicted) {
    const km = haversineKm(p.lat, p.lon, city.lat, city.lon);
    if (km <= radiusKm) {
      if (!current) {
        current = { start: p, end: p, closestKm: km, closestTime: p.time, points: [p] };
      } else {
        current.end = p;
        current.points.push(p);
        if (km < current.closestKm) {
          current.closestKm = km;
          current.closestTime = p.time;
        }
      }
    } else if (current) {
      passes.push(current);
      current = null;
    }
  }
  if (current) passes.push(current);
  return passes.map(({ start, end, closestKm, closestTime }) => ({
    start, end, closestKm, closestTime
  }));
}

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

export function issSummary(pos, nearestCityResult) {
  const near = nearestCityResult || nearestCity(pos.lat, pos.lon);
  const where =
    near.km <= 500
      ? `over land near ${near.city.name}`
      : `over the ocean/remote area, ${fmtInt(near.km)} km from ${near.city.name}`;
  return (
    `The ISS is ${where}, at ${fmtInt(pos.altKm)} km altitude, ` +
    `moving at ${fmtInt(pos.speedKmh)} km/h (${formatLatLon(pos.lat, pos.lon)}).`
  );
}
