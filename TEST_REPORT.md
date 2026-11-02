# TEST REPORT — Live Earth Tracker

## Fixtures
All four fixtures in `tests/fixtures/` are REAL responses fetched with curl on 2026-10-26 (no hand-made data).

| File | Size | Real / hand-made |
|---|---|---|
| `iss.json` | 313 bytes | real (api.wheretheiss.at) |
| `iss_positions.json` | 3,135 bytes | real (positions endpoint, 10 timestamps 1 min apart starting now+60 s) |
| `quakes.geojson` | 137,559 bytes | real (USGS all_day feed) |
| `flights.json` | 40,296 bytes | real (OpenSky states/all, India box lamin=6 lomin=68 lamax=36 lomax=98) |

All four parse as valid JSON. Tests never touch the live internet: the server tests inject a fake `fetch` that serves these fixtures.

## Test count

**108 tests, 108 pass, 0 fail** (`npm test`, Node 24, `node --test tests/*.test.js`).

Breakdown by file:
- `geo.test.js` — 19 (distances, normalizeLon, bearing, destinationPoint, inBounds incl. antimeridian, splitAtAntimeridian, formatters, findCity, nearestCity)
- `quakes.test.js` — 11 (parse order lon/lat, null mag, radius/colour boundaries, filters, no mutation, stats, quakesNear, real fixture sanity)
- `iss.test.js` — 10 (parseIss seconds→ms, trail cap + duplicate-time rule, futureTimestamps, chunk, findPasses over/no-pass, issSummary wording)
- `flights.test.js` — 13 (trim callsigns, null fallback to icao24, m/s→km/h, skip null coords, airborne filter, limitFlights nearest-first, stats, extrapolateFlight 15 km/60 s + guards + no mutation, boundsToQuery clamps, null states)
- `cache.test.js` — 4 (TTL expiry, loader called once within TTL, stale on failure, rethrow with no old value)
- `server.test.js` — 21 (loadConfig file/env/missing, OAuth token requested once + reused + failed-login fallback, /api/config never leaks secrets, every route ok:true + shape, second call within TTL does not re-fetch, 429 → friendly message + 60 s backoff, /api/ask with fake LLM: parsed answer, no key → local, main-model empty content → fallback answers, fast skips main, both fail → local note, oversized body rejected)
- `ask.test.js` — 23 (every built-in intent with exact numbers, unknown → help, missing city doesn't crash, action coordinates are numbers; buildSnapshotForLlm < 6000 chars with the real fixtures, buildMessages shape, parseLlmReply on clean/fenced/prose/out-of-range/bad-layer/plain-text)
- `alerts.test.js` — 7 (threshold + new-only, never twice, seenIds cap 2000 keeping newest, ISS pass de-dup by 10-min bucket, report contains header/strongest/alert titles, (none) case, first-run rule)

`for f in server.js watcher.js src/*.js; do node --check "$f"; done` → no FAIL.

## Step checks (real output)

- **STEP 1**: `curl /` grep `id="map"` → 1; `/src/main.js` → 200; `/../prompt_5.md` → 404 (traversal blocked).
- **STEP 7 live**: `/api/quakes` returned real USGS data; startup line `AI answers: on (GLM-5.3, backup llama-3.1-8b-instruct) · OpenSky login: on` (no secret values printed).
- **STEP 11 live**: `POST /api/ask` with the real key returned `{"ok":true,"mode":"llm","model":"GLM-5.3","answer":"The ISS is currently over a remote ocean area at 12.00°N, 34.00°E, about 1,510 km from Nairobi…","action":{"type":"flyTo",…}}`.
- **STEP 14 endpoints** (all HTTP 200):
  - `/api/iss` → `{"ok":true,"data":{"lat":-33.07,"lon":27.21,"altKm":429.46,"speedKmh":27553.9,…}}`
  - `/api/iss/path` → `{"ok":true,"data":[{"lat":-35.63,"lon":30.47,…}, …90 points]}`
  - `/api/quakes` → `{"ok":true,"data":[{"id":"aka2026vffhyj","mag":2,"place":"40 km N of Tanana, Alaska",…}]}`
  - `/api/flights?south=6&west=68&north=36&east=98` → `{"ok":true,"data":[{"icao24":"801638","callsign":"AXB1087","country":"India","lat":24.84,"lon":94.07,…}]}`
  - `/api/alerts` → `{"ok":true,"data":[],"fetchedAt":…}`
  - `/api/config` → `{"ok":true,"data":{"llm":true,"openskyAuth":true,"intervals":{"issMs":2000,"flightsMs":20000,"quakesMs":60000}}}`
- **STEP 14 screenshots**: 1280×800 and 390×844 taken headlessly. Desktop: dark-styled map tiles (the CSS filter is active), the "Earth now" strip, dark side panel with layers/stats/ask/alerts, quake circles and the ISS marker visible. Phone: stacked layout, map on top, panel below. No 404s in the network log (only divIcons/circleMarkers are used, so Leaflet's marker images are never requested).
- **STEP 14 watcher** (`node watcher.js --once`): `[watcher] 2026-10-26: 191 quakes checked, 0 new alerts, 90 ISS path points, home city Kolkata` (first run earlier marked all existing quakes as seen without alerting, by design).

## Sources down or rate-limited during testing

None. During testing all four upstream sources (wheretheiss.at, USGS, OpenSky anonymous + authenticated, Soket LLM) responded successfully. OpenSky was tested against its 429 path only via the fake fetch in tests; the live India-box request succeeded.

## Still needs a human to check

- The real geolocation permission prompt ("📍 My location") — headless Chrome cannot grant it.
- AI answers with the real key over a longer session (GLM-5.3 takes ~30–40 s per answer; the "Quick answer" fallback link was verified in code paths but a human should feel the wait once).
- The watcher running for days (`npm run watch`) — alert de-duplication and the daily report rewrite were verified logically and with one real run, not over multiple days.
- Smooth plane/ISS motion on a real display (headless screenshots are static; the single rAF loop and its guard are in place, but the glide should be watched live).
