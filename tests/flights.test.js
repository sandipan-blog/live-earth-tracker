import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFlights,
  flightLabel,
  filterFlights,
  limitFlights,
  flightStats,
  extrapolateFlight,
  boundsToQuery
} from '../src/flights.js';
import { haversineKm } from '../src/geo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'flights.json'), 'utf8')
);

test('every parsed flight from the fixture has numeric lat/lon', () => {
  const list = parseFlights(fixture);
  assert.ok(list.length >= 1, `got ${list.length}`);
  for (const f of list) {
    assert.equal(typeof f.lat, 'number');
    assert.equal(typeof f.lon, 'number');
  }
});

test('trailing spaces in callsigns are trimmed', () => {
  const json = { time: 1, states: [['abc123', 'AXB1079 ', 'India', 1, 1, 77.3, 28.5, 1000, false, 94, 271, 0, null, 1120, null, false, 0]] };
  const f = parseFlights(json)[0];
  assert.equal(f.callsign, 'AXB1079');
});

test('an empty callsign becomes null and the label falls back to icao24 uppercased', () => {
  const json = { time: 1, states: [['ab12cd', '   ', 'India', 1, 1, 77.3, 28.5, 1000, false, 94, 271, 0, null, 1120, null, false, 0]] };
  const f = parseFlights(json)[0];
  assert.equal(f.callsign, null);
  assert.equal(flightLabel(f), 'AB12CD');
});

test('speed is converted from m/s to km/h', () => {
  const json = { time: 1, states: [['abc123', 'ABC  ', 'India', 1, 1, 77.3, 28.5, 1000, false, 100, 90, 0, null, 1000, null, false, 0]] };
  const f = parseFlights(json)[0];
  assert.ok(Math.abs(f.speedKmh - 360) < 0.001);
});

test('states with a null lat or lon are skipped', () => {
  const json = {
    time: 1,
    states: [
      ['a1', 'A1   ', 'X', 1, 1, null, 28.5, 1000, false, 100, 90, 0, null, 1000, null, false, 0],
      ['a2', 'A2   ', 'X', 1, 1, 77.3, null, 1000, false, 100, 90, 0, null, 1000, null, false, 0],
      ['a3', 'A3   ', 'X', 1, 1, 77.3, 28.5, 1000, false, 100, 90, 0, null, 1000, null, false, 0]
    ]
  };
  assert.equal(parseFlights(json).length, 1);
});

test('null states gives []', () => {
  assert.deepEqual(parseFlights({ time: 1, states: null }), []);
  assert.deepEqual(parseFlights(null), []);
});

test('the airborne filter drops on-ground planes', () => {
  const list = [
    { icao24: 'a', callsign: 'A', country: 'X', lat: 10, lon: 10, altM: 0, onGround: true, speedKmh: 0, heading: 0, verticalRate: 0, lastContact: 0 },
    { icao24: 'b', callsign: 'B', country: 'X', lat: 11, lon: 10, altM: 9000, onGround: false, speedKmh: 800, heading: 90, verticalRate: 0, lastContact: 0 }
  ];
  assert.equal(filterFlights(list).length, 1);
  assert.equal(filterFlights(list, { airborneOnly: false }).length, 2);
  const b = { south: 0, west: 0, north: 20, east: 20 };
  assert.equal(filterFlights(list, { bounds: b }).length, 1);
});

test('limitFlights keeps the planes nearest the centre', () => {
  const list = [
    { icao24: 'far', lat: 40, lon: 40 },
    { icao24: 'near', lat: 1, lon: 1 },
    { icao24: 'mid', lat: 10, lon: 10 }
  ];
  const kept = limitFlights(list, 2, { lat: 0, lon: 0 });
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((f) => f.icao24), ['near', 'mid']);
  // Fewer than max: returned unchanged (a copy).
  assert.equal(limitFlights(list, 10).length, 3);
});

test('flightStats counts and top countries', () => {
  const list = [
    { country: 'India', onGround: false },
    { country: 'India', onGround: false },
    { country: 'India', onGround: true },
    { country: 'USA', onGround: false },
    { country: 'USA', onGround: false },
    { country: 'Germany', onGround: false }
  ];
  const s = flightStats(list);
  assert.equal(s.count, 6);
  assert.equal(s.airborne, 5);
  assert.equal(s.onGround, 1);
  assert.deepEqual(s.topCountries.slice(0, 2), [['India', 3], ['USA', 2]]);
  assert.equal(s.topCountries.length, 3);
});

test('extrapolateFlight moves a plane 15 km east in 60 s at 900 km/h heading 90', () => {
  const f = { icao24: 'x', lat: 0, lon: 0, onGround: false, speedKmh: 900, heading: 90 };
  const moved = extrapolateFlight(f, 60000);
  assert.ok(Math.abs(moved.lat) < 0.01, `lat ${moved.lat}`);
  // 15 km east on the equator ≈ 0.1349° of longitude
  assert.ok(Math.abs(moved.lon - 15 / 111.19) < 0.1, `lon ${moved.lon}`);
  // distance actually travelled is ~15 km ±0.1
  const d = haversineKm(0, 0, moved.lat, moved.lon);
  assert.ok(Math.abs(d - 15) <= 0.1, `d ${d}`);
});

test('extrapolateFlight leaves on-ground planes unchanged and refuses dt over 2 minutes', () => {
  const ground = { icao24: 'g', lat: 1, lon: 1, onGround: true, speedKmh: 500, heading: 0 };
  assert.equal(extrapolateFlight(ground, 60000), ground);
  const f = { icao24: 'x', lat: 0, lon: 0, onGround: false, speedKmh: 900, heading: 90 };
  assert.equal(extrapolateFlight(f, 120001), f);
  const noSpeed = { icao24: 'y', lat: 0, lon: 0, onGround: false, speedKmh: null, heading: 90 };
  assert.equal(extrapolateFlight(noSpeed, 60000), noSpeed);
});

test('extrapolateFlight never mutates the input', () => {
  const f = { icao24: 'x', lat: 0, lon: 0, onGround: false, speedKmh: 900, heading: 90 };
  extrapolateFlight(f, 60000);
  assert.equal(f.lat, 0);
  assert.equal(f.lon, 0);
});

test('boundsToQuery rounds and clamps values', () => {
  const q = boundsToQuery({ south: 6.12345, west: 68.999, north: 95, east: -190 });
  assert.equal(q, 'lamin=6.12&lomin=69.00&lamax=90.00&lomax=-180.00');
});
