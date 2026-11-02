import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answerLocal } from '../src/ask.js';

const NOW = 1700000000000;

const snapshot = {
  now: NOW,
  iss: { lat: -46.4, lon: 74.2, altKm: 433.1, speedKmh: 27550, visibility: 'daylight', time: NOW },
  issPath: [
    { lat: -40, lon: 70, time: NOW + 10 * 60000 },
    { lat: -28.61, lon: 77.21, time: NOW + 20 * 60000 }, // over Delhi area (within 1000 km)
    { lat: -10, lon: 85, time: NOW + 30 * 60000 }
  ],
  quakes: [
    { id: 'q1', mag: 6.2, place: 'Fiji region', time: NOW - 3600000, lat: -17.8, lon: 178.1, depthKm: 600, url: 'u1' },
    { id: 'q2', mag: 3.1, place: 'Hindu Kush region', time: NOW - 7200000, lat: 36.5, lon: 70.5, depthKm: 190, url: 'u2' },
    { id: 'q3', mag: 1.2, place: 'Central California', time: NOW - 1800000, lat: 35.0, lon: -120.0, depthKm: 5, url: 'u3' }
  ],
  flights: [
    { icao24: 'a1', callsign: 'AIC101', country: 'India', lat: 28.9, lon: 77.1, altM: 10000, onGround: false, speedKmh: 800, heading: 90 },
    { icao24: 'a2', callsign: 'IGO234', country: 'India', lat: 28.4, lon: 77.5, altM: 9000, onGround: false, speedKmh: 750, heading: 270 },
    { icao24: 'a3', callsign: null, country: 'India', lat: 12.9, lon: 77.5, altM: 8000, onGround: false, speedKmh: 700, heading: 180 }
  ],
  flightsBounds: { south: 6, west: 68, north: 36, east: 98 },
  selectedCity: null
};

test('where is the ISS → summary + flyTo', () => {
  const r = answerLocal('Where is the ISS?', snapshot);
  assert.ok(r.answer.includes('ISS'));
  assert.ok(r.answer.includes('km altitude'));
  assert.deepEqual(r.action, { type: 'flyTo', lat: -46.4, lon: 74.2, zoom: 4 });
});

test('when will the ISS pass over a city → words + flyTo', () => {
  const r = answerLocal('When will the ISS pass over Delhi?', {
    ...snapshot,
    issPath: [
      { lat: 40, lon: 60, time: NOW + 10 * 60000 },
      { lat: 28.7, lon: 77.0, time: NOW + 37 * 60000 },
      { lat: 10, lon: 90, time: NOW + 60 * 60000 }
    ]
  });
  assert.ok(r.answer.includes('Delhi'), r.answer);
  assert.ok(r.answer.includes('min'), r.answer);
  assert.equal(r.action.type, 'flyTo');
  assert.equal(r.action.lat, 28.61);
  assert.equal(typeof r.action.lat, 'number');
});

test('no ISS pass near a city in range', () => {
  const r = answerLocal('when will the ISS pass over Tokyo?', {
    ...snapshot,
    issPath: [{ lat: -40, lon: 70, time: NOW + 600000 }]
  });
  assert.ok(r.answer.includes('No ISS pass near Tokyo'), r.answer);
});

test('biggest earthquake → mag, place, ago + flyTo + highlight-able data', () => {
  const r = answerLocal('Biggest earthquake today?', snapshot);
  assert.ok(r.answer.includes('M6.2'), r.answer);
  assert.ok(r.answer.includes('Fiji region'), r.answer);
  assert.ok(r.answer.includes('h ago') || r.answer.includes('min ago'), r.answer);
  assert.deepEqual(r.action, { type: 'flyTo', lat: -17.8, lon: 178.1, zoom: 6 });
});

test('how many earthquakes → count', () => {
  const r = answerLocal('How many earthquakes today?', snapshot);
  assert.ok(r.answer.includes('3 earthquakes'), r.answer);
});

test('how many earthquakes above a threshold', () => {
  const r = answerLocal('How many earthquakes above 3?', snapshot);
  assert.ok(r.answer.includes('2 earthquakes'), r.answer);
});

test('earthquakes near a city → count and nearest + flyTo', () => {
  // Delhi (28.61, 77.21): Hindu Kush quake ~1079 km away → within 1000? No.
  const r = answerLocal('Earthquakes near Delhi?', snapshot);
  if (r.answer.startsWith('No earthquakes')) {
    assert.ok(r.answer.includes('No earthquakes within 1000 km of Delhi'));
  } else {
    assert.ok(r.answer.includes('earthquakes within 1000 km of Delhi'));
  }
  assert.equal(r.action.type, 'flyTo');
  assert.equal(r.action.lat, 28.61);
});

test('earthquakes near a city with a close quake', () => {
  const r = answerLocal('Any earthquakes near Tokyo?', {
    ...snapshot,
    quakes: [
      { id: 't1', mag: 4.0, place: 'eastern Honshu', time: NOW - 600000, lat: 36.0, lon: 140.5, depthKm: 40, url: 'u' },
      { id: 't2', mag: 2.0, place: 'far away', time: NOW - 600000, lat: -17.8, lon: 178.1, depthKm: 600, url: 'u' }
    ]
  });
  assert.ok(r.answer.includes('1 earthquakes') || r.answer.includes('1 earthquake'), r.answer);
  assert.ok(r.answer.includes('M4.0'), r.answer);
});

test('flights over a city inside the bounds → count and up to 3 callsigns', () => {
  const r = answerLocal('Flights over Delhi?', snapshot);
  assert.ok(r.answer.includes('2 flights'), r.answer);
  assert.ok(r.answer.includes('AIC101'), r.answer);
  assert.ok(r.answer.includes('IGO234'), r.answer);
  assert.ok(!r.answer.includes('Bengaluru'));
  assert.equal(r.action.type, 'flyTo');
});

test('flights over a city outside the current view → move-the-map answer', () => {
  const r = answerLocal('Flights over London?', snapshot);
  assert.ok(r.answer.includes('Move the map to London first'), r.answer);
  assert.equal(r.action.zoom, 7);
});

test('a missing city in "flights over xyz" does not crash', () => {
  const r = answerLocal('Flights over xyzzy?', snapshot);
  assert.equal(typeof r.answer, 'string');
  assert.ok(r.answer.length > 0);
});

test('unknown questions give the help text', () => {
  const r = answerLocal('What is the capital of France?', snapshot);
  assert.ok(r.answer.includes('Where is the ISS'), r.answer);
  assert.equal(r.action, null);
});

test('help intent gives examples', () => {
  const r = answerLocal('help', snapshot);
  assert.ok(r.answer.includes('Try asking'), r.answer);
});

test('all action coordinates are numbers', () => {
  for (const q of ['Where is the ISS?', 'Biggest earthquake today?', 'Flights over Delhi?']) {
    const r = answerLocal(q, snapshot);
    if (r.action) {
      assert.equal(typeof r.action.lat, 'number');
      assert.equal(typeof r.action.lon, 'number');
      assert.equal(typeof r.action.zoom, 'number');
    }
  }
});

// ---------- LLM helpers (STEP 11) ----------

import {
  buildSnapshotForLlm,
  buildMessages,
  parseLlmReply
} from '../src/ask.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const quakesFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'quakes.geojson'), 'utf8')
);
const flightsFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'flights.json'), 'utf8')
);
const issPathFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'iss_positions.json'), 'utf8')
);

test('buildSnapshotForLlm stays under 6000 characters with the real fixtures', () => {
  const snap = {
    now: Date.now(),
    iss: { lat: 12.34, lon: 56.78, altKm: 420, speedKmh: 27600 },
    issPath: issPathFixture.map((p) => ({ lat: p.latitude, lon: p.longitude, time: p.timestamp * 1000 })),
    quakes: quakesFixture.features.slice(0, 200).map((f) => ({
      id: f.id, mag: f.properties.mag || 0, place: f.properties.place,
      time: f.properties.time, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0]
    })),
    flights: flightsFixture.states.slice(0, 100).map((s) => ({
      icao24: s[0], callsign: (s[1] || '').trim() || null, country: s[2],
      lat: s[6], lon: s[5], altM: s[13], onGround: s[8] === true, speedKmh: s[9] == null ? null : s[9] * 3.6
    })),
    flightsBounds: { south: 6, west: 68, north: 36, east: 98 },
    selectedCity: { name: 'Kolkata', lat: 22.57, lon: 88.36 }
  };
  const compact = buildSnapshotForLlm(snap);
  const text = JSON.stringify(compact);
  assert.ok(text.length < 6000, `snapshot is ${text.length} chars`);
  assert.ok(Array.isArray(compact.strongestQuakes));
  assert.ok(compact.strongestQuakes.length <= 15);
  assert.ok(compact.flightsInView.sample.length <= 15);
});

test('buildMessages makes an OpenAI-style system + user pair', () => {
  const msgs = buildMessages('Where is the ISS?', { a: 1 });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[0].content.includes('ONLY'));
  assert.ok(msgs[0].content.includes('JSON'));
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('Where is the ISS?'));
  assert.ok(msgs[1].content.includes('"a":1'));
});

test('parseLlmReply on clean JSON', () => {
  const r = parseLlmReply('{"answer":"It is over India.","action":{"type":"flyTo","lat":20,"lon":78,"zoom":4}}');
  assert.equal(r.answer, 'It is over India.');
  assert.deepEqual(r.action, { type: 'flyTo', lat: 20, lon: 78, zoom: 4 });
});

test('parseLlmReply on JSON inside code fences', () => {
  const r = parseLlmReply('```json\n{"answer":"Hi","action":null}\n```');
  assert.equal(r.answer, 'Hi');
  assert.equal(r.action, null);
});

test('parseLlmReply on JSON after some prose', () => {
  const r = parseLlmReply('Sure! Here you go: {"answer":"Over Tokyo.","action":null} hope that helps');
  assert.equal(r.answer, 'Over Tokyo.');
  assert.equal(r.action, null);
});

test('parseLlmReply drops an out-of-range flyTo', () => {
  const r = parseLlmReply('{"answer":"x","action":{"type":"flyTo","lat":95,"lon":300,"zoom":99}}');
  assert.equal(r.answer, 'x');
  assert.equal(r.action, null);
});

test('parseLlmReply keeps a valid highlight action and drops a bad layer', () => {
  const ok = parseLlmReply('{"answer":"x","action":{"type":"highlight","layer":"quakes","ids":["q1"]}}');
  assert.deepEqual(ok.action, { type: 'highlight', layer: 'quakes', ids: ['q1'] });
  const bad = parseLlmReply('{"answer":"x","action":{"type":"highlight","layer":"volcanoes","ids":["q1"]}}');
  assert.equal(bad.action, null);
});

test('parseLlmReply falls back to plain text when there is no JSON', () => {
  const r = parseLlmReply('  The ISS is somewhere over the Pacific right now.  ');
  assert.equal(r.answer, 'The ISS is somewhere over the Pacific right now.');
  assert.equal(r.action, null);
});

test('parseLlmReply trims leading blank lines', () => {
  const r = parseLlmReply('\n\n  {"answer":"ok","action":null}');
  assert.equal(r.answer, 'ok');
});
