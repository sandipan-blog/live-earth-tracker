import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_KM,
  haversineKm,
  normalizeLon,
  bearingDeg,
  destinationPoint,
  inBounds,
  splitAtAntimeridian,
  formatLatLon,
  formatAgo
} from '../src/geo.js';
import { CITIES, findCity, nearestCity } from '../src/cities.js';

test('EARTH_RADIUS_KM is set', () => {
  assert.equal(EARTH_RADIUS_KM, 6371);
});

test('Kolkata–Delhi distance is 1300–1330 km', () => {
  const d = haversineKm(22.57, 88.36, 28.61, 77.21);
  assert.ok(d >= 1300 && d <= 1330, `got ${d}`);
});

test('London–New York distance is 5550–5600 km', () => {
  const d = haversineKm(51.51, -0.13, 40.71, -74.01);
  assert.ok(d >= 5550 && d <= 5600, `got ${d}`);
});

test('distance to itself is 0', () => {
  assert.equal(haversineKm(10, 20, 10, 20), 0);
});

test('normalizeLon wraps into [-180, 180)', () => {
  assert.equal(normalizeLon(190), -170);
  assert.equal(normalizeLon(-190), 170);
  assert.equal(normalizeLon(180), -180);
});

test('bearing east along the equator is 90, north is 0', () => {
  const east = bearingDeg(0, 0, 0, 10);
  assert.ok(Math.abs(east - 90) < 0.5, `east ${east}`);
  const north = bearingDeg(0, 0, 10, 0);
  assert.ok(north < 0.5 || north > 359.5, `north ${north}`);
});

test('destinationPoint 111.19 km east on the equator ≈ lon 1', () => {
  const p = destinationPoint(0, 0, 90, 111.19);
  assert.ok(Math.abs(p.lat) <= 0.01);
  assert.ok(Math.abs(p.lon - 1) <= 0.01);
});

test('travelling 100 km north then back gives 100 ±0.1 km', () => {
  const p = destinationPoint(10, 20, 0, 100);
  const back = haversineKm(10, 20, p.lat, p.lon);
  assert.ok(Math.abs(back - 100) <= 0.1, `got ${back}`);
});

test('inBounds for a normal box', () => {
  const b = { south: 6, west: 68, north: 36, east: 98 };
  assert.equal(inBounds(20, 78, b), true);
  assert.equal(inBounds(0, 78, b), false);
  assert.equal(inBounds(20, 100, b), false);
});

test('inBounds for an antimeridian box', () => {
  const b = { south: 10, west: 170, north: 30, east: -170 };
  assert.equal(inBounds(20, 175, b), true);
  assert.equal(inBounds(20, -175, b), true);
  assert.equal(inBounds(20, 0, b), false);
});

test('splitAtAntimeridian splits on a jump > 180°', () => {
  const segs = splitAtAntimeridian([[0, 170], [0, 179], [0, -179], [0, -170]]);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0], [[0, 170], [0, 179]]);
  assert.deepEqual(segs[1], [[0, -179], [0, -170]]);
});

test('splitAtAntimeridian leaves a normal path as 1 segment', () => {
  const segs = splitAtAntimeridian([[0, 10], [0, 20], [0, 30]]);
  assert.equal(segs.length, 1);
});

test('formatLatLon', () => {
  assert.equal(formatLatLon(-33.87, 151.21), '33.87°S, 151.21°E');
  assert.equal(formatLatLon(22.57, 88.36), '22.57°N, 88.36°E');
});

test('formatAgo', () => {
  assert.equal(formatAgo(5000), 'just now');
  assert.equal(formatAgo(5 * 60 * 1000), '5 min ago');
  assert.equal(formatAgo(3 * 3600 * 1000), '3 h ago');
});

test('CITIES has at least 40 entries', () => {
  assert.ok(CITIES.length >= 40);
});

test('findCity matches case-insensitively anywhere in text', () => {
  const c = findCity('flights over new delhi?');
  assert.equal(c.name, 'New Delhi');
});

test('findCity prefers the longest match', () => {
  const c = findCity('is it raining in Delhi?');
  assert.equal(c.name, 'Delhi');
});

test('findCity returns null when nothing matches', () => {
  assert.equal(findCity('hello'), null);
  assert.equal(findCity(''), null);
});

test('nearestCity of Kolkata coordinates is Kolkata at ~0 km', () => {
  const r = nearestCity(22.57, 88.36);
  assert.equal(r.city.name, 'Kolkata');
  assert.ok(r.km < 1, `got ${r.km}`);
});
