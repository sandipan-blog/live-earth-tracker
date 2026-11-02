import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newQuakeAlerts,
  issPassAlerts,
  buildDailyReport,
  isFirstRun
} from '../src/alerts.js';

const NOW = 1700000000000;

const quake = (id, mag, time = NOW) => ({
  id, mag, place: `place ${id}`, lat: 10, lon: 20, depthKm: 33, time, tsunami: false
});

test('newQuakeAlerts alerts only new quakes above the threshold', () => {
  const quakes = [quake('a', 5.5), quake('b', 4.9), quake('c', 6.1), quake('d', 3.0)];
  const r = newQuakeAlerts(quakes, [], { minMag: 5.0 });
  assert.equal(r.alerts.length, 2);
  assert.deepEqual(r.alerts.map((a) => a.id).sort(), ['quake-a', 'quake-c']);
  assert.ok(r.alerts.every((a) => a.kind === 'quake'));
  assert.ok(r.alerts.every((a) => typeof a.lat === 'number' && typeof a.lon === 'number'));
});

test('newQuakeAlerts never alerts the same id twice', () => {
  const quakes = [quake('a', 5.5)];
  const first = newQuakeAlerts(quakes, []);
  const second = newQuakeAlerts(quakes, first.seenIds);
  assert.equal(second.alerts.length, 0);
});

test('seenIds is capped at 2000 and keeps the newest', () => {
  const quakes = [];
  for (let i = 0; i < 2500; i++) quakes.push(quake(`q${i}`, 1.0, NOW - i * 1000));
  const r = newQuakeAlerts(quakes, []);
  assert.equal(r.seenIds.length, 2000);
  assert.equal(r.seenIds[0], 'q0'); // newest kept
  assert.ok(!r.seenIds.includes('q2499'));
});

test('issPassAlerts de-duplicates by city + pass start rounded to 10 minutes', () => {
  const city = { name: 'Kolkata', lat: 22.57, lon: 88.36 };
  const passes = [
    { start: { time: NOW + 30 * 60000 }, end: { time: NOW + 40 * 60000 }, closestKm: 400, closestTime: NOW }
  ];
  const first = issPassAlerts(passes, city, [], NOW);
  assert.equal(first.alerts.length, 1);
  assert.ok(first.alerts[0].title.includes('Kolkata'));
  // same pass again (start within the same 10-min bucket) → no new alert
  const second = issPassAlerts(passes, city, first.keys, NOW);
  assert.equal(second.alerts.length, 0);
  // a different pass 15 minutes later → new alert
  const passes2 = [
    { start: { time: NOW + 45 * 60000 }, end: { time: NOW + 55 * 60000 }, closestKm: 500, closestTime: NOW }
  ];
  const third = issPassAlerts(passes2, city, first.keys, NOW);
  assert.equal(third.alerts.length, 1);
});

test('buildDailyReport contains the table header, strongest quake and alert titles', () => {
  const quakes = [
    { id: 'q1', mag: 6.2, place: 'Fiji region', lat: -17.8, lon: 178.1, depthKm: 600, time: NOW },
    { id: 'q2', mag: 3.1, place: 'Hindu Kush', lat: 36.5, lon: 70.5, depthKm: 190, time: NOW },
    { id: 'q3', mag: 1.0, place: 'California', lat: 35, lon: -120, depthKm: 5, time: NOW }
  ];
  const alerts = [
    { id: 'quake-q1', kind: 'quake', title: 'M6.2 earthquake', detail: 'Fiji region', lat: -17.8, lon: 178.1, time: NOW },
    { id: 'iss-x', kind: 'iss', title: 'ISS pass over Kolkata', detail: 'in 37 min', lat: 22.57, lon: 88.36, time: NOW }
  ];
  const md = buildDailyReport('2026-10-26', quakes, alerts, Array.from({ length: 90 }));
  assert.ok(md.includes('# Earth report — 2026-10-26'));
  assert.ok(md.includes('| Mag | Place | Depth (km) | Time (UTC) |'));
  assert.ok(md.includes('M6.2'));
  assert.ok(md.includes('Fiji region'));
  assert.ok(md.includes('M6.2 earthquake'));
  assert.ok(md.includes('ISS pass over Kolkata'));
  assert.ok(md.includes('Positions sampled: 90'));
  assert.ok(md.includes('Total: **3**'));
});

test('buildDailyReport with no alerts says (none)', () => {
  const md = buildDailyReport('2026-10-26', [], [], []);
  assert.ok(md.includes('(none)'));
});

test('isFirstRun decides the first-run rule', () => {
  assert.equal(isFirstRun(null), true);
  assert.equal(isFirstRun(undefined), true);
  assert.equal(isFirstRun({}), true);
  assert.equal(isFirstRun({ lastRun: 123 }), false);
});
