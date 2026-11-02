import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseIss,
  createTrail,
  futureTimestamps,
  chunk,
  findPasses,
  issSummary
} from '../src/iss.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const issFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'iss.json'), 'utf8')
);

test('parseIss converts seconds to ms and keeps the numbers', () => {
  const pos = parseIss(issFixture);
  assert.equal(pos.time, issFixture.timestamp * 1000);
  assert.equal(pos.lat, issFixture.latitude);
  assert.equal(pos.lon, issFixture.longitude);
  assert.equal(pos.altKm, issFixture.altitude);
  assert.equal(pos.speedKmh, issFixture.velocity);
  assert.equal(typeof pos.time, 'number');
});

test('trail keeps only the newest maxPoints', () => {
  const trail = createTrail(3);
  for (let i = 0; i < 6; i++) trail.add({ lat: i, lon: i, time: i });
  const pts = trail.points();
  assert.equal(pts.length, 3);
  assert.deepEqual(pts.map((p) => p.time), [3, 4, 5]);
});

test('trail ignores a point with the same time as the last one', () => {
  const trail = createTrail();
  trail.add({ lat: 1, lon: 1, time: 100 });
  trail.add({ lat: 2, lon: 2, time: 100 });
  assert.equal(trail.points().length, 1);
  assert.deepEqual(trail.points()[0], { lat: 1, lon: 1, time: 100 });
});

test('trail clear empties it', () => {
  const trail = createTrail();
  trail.add({ lat: 1, lon: 1, time: 1 });
  trail.clear();
  assert.equal(trail.points().length, 0);
});

test('futureTimestamps returns 90 values 60 s apart in seconds', () => {
  const now = 1700000000000;
  const ts = futureTimestamps(now);
  assert.equal(ts.length, 90);
  assert.equal(ts[0], now / 1000 + 60);
  assert.equal(ts[89], now / 1000 + 90 * 60);
  for (let i = 1; i < ts.length; i++) {
    assert.equal(ts[i] - ts[i - 1], 60);
  }
  assert.ok(ts.every((t) => Number.isInteger(t)));
});

test('chunk of 90 gives 9 chunks of 10', () => {
  const chunks = chunk(Array.from({ length: 90 }, (_, i) => i));
  assert.equal(chunks.length, 9);
  assert.ok(chunks.every((c) => c.length === 10));
  assert.deepEqual(chunk([1, 2, 3], 10), [[1, 2, 3]]);
});

test('findPasses finds exactly 1 pass over a city with the right closest point', () => {
  const delhi = { name: 'Delhi', country: 'India', lat: 28.61, lon: 77.21 };
  // A track that approaches Delhi, flies over it, then leaves.
  const track = [
    { lat: 40, lon: 60, time: 1000 },
    { lat: 34, lon: 68, time: 2000 },
    { lat: 28.7, lon: 77.0, time: 3000 }, // ~85 km away
    { lat: 28.61, lon: 77.21, time: 4000 }, // 0 km — closest
    { lat: 28.5, lon: 78.0, time: 5000 }, // ~92 km
    { lat: 20, lon: 90, time: 6000 }
  ];
  const passes = findPasses(track, delhi, 1000);
  assert.equal(passes.length, 1);
  assert.equal(passes[0].start.time, 3000);
  assert.equal(passes[0].end.time, 5000);
  assert.equal(passes[0].closestTime, 4000);
  assert.ok(passes[0].closestKm < 1);
});

test('findPasses returns [] for a track that never comes close', () => {
  const london = { name: 'London', country: 'UK', lat: 51.51, lon: -0.13 };
  const track = [
    { lat: 0, lon: 0, time: 1000 },
    { lat: 10, lon: 10, time: 2000 },
    { lat: 20, lon: 20, time: 3000 }
  ];
  assert.deepEqual(findPasses(track, london, 1000), []);
});

test('issSummary contains altitude and speed with thousands separators', () => {
  const pos = { lat: 22.57, lon: 88.36, altKm: 418.2, speedKmh: 27600.4 };
  const near = { city: { name: 'Chennai' }, km: 1240 };
  const s = issSummary(pos, near);
  assert.ok(s.includes('418 km altitude'), s);
  assert.ok(s.includes('27,600 km/h'), s);
  assert.ok(s.includes('1,240 km from Chennai'), s);
});

test('issSummary says "over land near" when within 500 km', () => {
  const pos = { lat: 28.61, lon: 77.21, altKm: 420, speedKmh: 27500 };
  const near = { city: { name: 'Delhi' }, km: 12 };
  assert.ok(issSummary(pos, near).includes('over land near Delhi'));
});
