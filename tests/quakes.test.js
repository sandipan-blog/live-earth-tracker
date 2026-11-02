import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseQuakes,
  quakeRadiusPx,
  quakeColor,
  filterQuakes,
  sortByMag,
  strongest,
  quakeStats,
  quakesNear
} from '../src/quakes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'quakes.geojson'), 'utf8')
);

// Hand-written sample with known exact values.
const sample = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'q1',
      properties: { mag: 6.2, place: 'Big one, Fiji', time: 1700000000000, url: 'https://example.com/q1', tsunami: 0 },
      geometry: { coordinates: [178.1, -17.8, 600] } // [lon, lat, depth]
    },
    {
      id: 'q2',
      properties: { mag: null, place: 'Null mag, Alaska', time: 1700000100000, url: 'https://example.com/q2', tsunami: 0 },
      geometry: { coordinates: [-150.0, 61.0, 30] }
    },
    {
      id: 'q3',
      properties: { mag: 4.4, place: 'Mid one, Hindu Kush', time: 1700000200000, url: 'https://example.com/q3', tsunami: 1 },
      geometry: { coordinates: [70.5, 36.5, 190] }
    },
    {
      id: 'q4',
      properties: { mag: 2.4, place: 'Small one, California', time: 1700000300000, url: 'https://example.com/q4', tsunami: 0 },
      geometry: { coordinates: [-120.0, 35.0, 5] }
    },
    {
      id: 'q5-nocoords',
      properties: { mag: 5.0, place: 'No coords, skipped', time: 1700000400000, url: '', tsunami: 0 },
      geometry: { coordinates: [] }
    }
  ]
};

test('parseQuakes reads lat/lon in the right order and skips missing coords', () => {
  const list = parseQuakes(sample);
  assert.equal(list.length, 4);
  const fiji = list.find((q) => q.id === 'q1');
  assert.equal(fiji.lat, -17.8);
  assert.equal(fiji.lon, 178.1);
  assert.equal(fiji.depthKm, 600);
  assert.equal(fiji.mag, 6.2);
  assert.equal(fiji.place, 'Big one, Fiji');
  assert.equal(fiji.url, 'https://example.com/q1');
});

test('a null mag becomes 0', () => {
  const alaska = parseQuakes(sample).find((q) => q.id === 'q2');
  assert.equal(alaska.mag, 0);
});

test('tsunami flag is parsed', () => {
  const hk = parseQuakes(sample).find((q) => q.id === 'q3');
  assert.equal(hk.tsunami, true);
});

test('quakeRadiusPx at boundaries', () => {
  assert.equal(quakeRadiusPx(0), 4);
  assert.equal(quakeRadiusPx(-5), 4); // clamped low
  assert.equal(quakeRadiusPx(10), 30); // clamped high
  assert.equal(quakeRadiusPx(2), 10);
});

test('quakeColor at boundaries', () => {
  assert.equal(quakeColor(1.0), '#3ecf8e');
  assert.equal(quakeColor(2.4), '#3ecf8e');
  assert.equal(quakeColor(2.5), '#f5c542'); // 2.5 is NOT < 2.5
  assert.equal(quakeColor(4.4), '#f5c542');
  assert.equal(quakeColor(4.5), '#ff8c42');
  assert.equal(quakeColor(5.9), '#ff8c42');
  assert.equal(quakeColor(6.0), '#ff4d4f');
  assert.equal(quakeColor(7.3), '#ff4d4f');
});

test('filterQuakes filters by minMag and sinceMs', () => {
  const list = parseQuakes(sample);
  assert.equal(filterQuakes(list, { minMag: 4 }).length, 2); // q1 (6.2), q3 (4.4)
  assert.equal(filterQuakes(list, { sinceMs: 1700000150000 }).length, 2); // q4, q5 skipped anyway -> q4 only? no: q4 t=...300000
});

test('sortByMag sorts biggest first without mutating', () => {
  const list = parseQuakes(sample);
  const before = list.map((q) => q.id).join(',');
  const sorted = sortByMag(list);
  assert.equal(sorted[0].id, 'q1');
  assert.equal(sorted[sorted.length - 1].id, 'q2'); // mag 0 last
  assert.equal(list.map((q) => q.id).join(','), before);
});

test('strongest returns the biggest quake', () => {
  assert.equal(strongest(parseQuakes(sample)).id, 'q1');
  assert.equal(strongest([]), null);
});

test('quakeStats counts are right for the sample', () => {
  const s = quakeStats(parseQuakes(sample));
  assert.equal(s.count, 4);
  assert.equal(s.maxMag, 6.2);
  assert.equal(s.strongest.id, 'q1');
  assert.equal(s.countAbove[2.5], 2); // q1, q3
  assert.equal(s.countAbove[4.5], 1); // q1
  assert.equal(s.countAbove[6], 1); // q1
});

test('quakesNear filters and sorts by distance', () => {
  const list = parseQuakes(sample);
  // Near Delhi (28.61, 77.21): the Hindu Kush quake is ~1079 km away, others far.
  const near = quakesNear(list, 28.61, 77.21, 1100);
  assert.equal(near.length, 1);
  assert.equal(near[0].id, 'q3');
  assert.ok(near[0].distanceKm > 1000 && near[0].distanceKm < 1100);
  // A wide radius around Fiji returns Fiji first (closest).
  const wide = quakesNear(list, -17.8, 178.1, 20000);
  assert.equal(wide[0].id, 'q1');
  assert.equal(wide[0].distanceKm, 0);
  assert.ok(wide.every((q, i) => i === 0 || q.distanceKm >= wide[i - 1].distanceKm));
});

test('the real fixture parses into valid quakes', () => {
  const list = parseQuakes(realFixture);
  assert.ok(list.length >= 1, `got ${list.length}`);
  for (const q of list) {
    assert.ok(q.lat >= -90 && q.lat <= 90, `lat ${q.lat}`);
    assert.ok(q.lon >= -180 && q.lon <= 180, `lon ${q.lon}`);
  }
});
