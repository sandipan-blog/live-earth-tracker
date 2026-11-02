# LIVE EARTH TRACKER: step-by-step prompt for the loop agent

## How to run this with loop (for the human)
Start loop in `~/loop/gaming_hackathon/` (so `.loop/APPEND_SYSTEM.md` with "Reasoning: low" is used), pick the model with `/model`, then send these messages ONE AT A TIME. Wait for each one to finish (and its CHECK to pass) before sending the next.

1. `Read live-earth-tracker/prompt.md. Do not plan or analyse. Do STEP 1 only.`
2. `Do STEP 2 only.`
3. `Do STEP 3 only. Write the files now.`
4. `Do STEP 4 only. Write the files now.`
5. `Do STEP 5 only. Write the files now.`
6. `Do STEP 6 only. Write the files now.`
7. `Do STEP 7 only. Write the files now.`
8. `Do STEP 8 only. Write the files now.`
9. `Do STEP 9 only. Write the files now.`
10. `Do STEP 10 only. Write the files now.`
11. `Do STEP 11 only. Write the files now.`
12. `Do STEP 12 only. Write the files now.`
13. `Do STEP 13 only. Write the files now.`
14. `Do STEP 14 only.`

- If it stalls or thinks too long: press esc and send `Write the file now, don't plan.`
- If a CHECK fails: send `The STEP N check failed. Fix the code (not the tests) and rerun the check.`
- If you see `sse error` / a connection error: send the same message again.
- If the context gets full, or at the start of a new day: send `/new`, then `Read live-earth-tracker/prompt.md. Do not plan or analyse. Check what already exists in live-earth-tracker, then do STEP N only.`
- To try it yourself at any point after STEP 8: `cd ~/loop/gaming_hackathon/live-earth-tracker && npm start`, then open http://localhost:8085.
- Your logins are already saved in `~/.secrets/live-earth.json` (outside the project, readable only by you): the Soket key (the same one loop uses) with GLM-5.3 as the AI model and llama-3.1-8b-instruct as the fast backup, and the OpenSky client for faster flights. The server reads that file by itself, so `npm start` is all you need. Never paste the key into loop or any project file. To change a login, edit that file.

---

## What we are building
A live world map in the browser that tracks three real things at once, plus an AI agent on top of it:
1. **ISS**: the International Space Station's live position, its trail, its predicted path for the next 90 minutes, and whether it passes near a chosen city.
2. **Earthquakes**: every earthquake from the last 24 hours as circles sized and coloured by magnitude.
3. **Flights**: live aircraft over the current map view as small plane icons rotated to their heading.
4. **"Ask the map"**: a chat box. The user asks questions in plain English ("where is the ISS?", "biggest earthquake today?", "flights over Delhi?"); the agent answers from the live data and moves the map to the answer.
5. **Watcher agent**: a background Node script that checks the data every few minutes, raises alerts (big earthquakes, ISS passing near the home city) and writes a daily report.

All data is free and needs NO API key. The map is Leaflet with OpenStreetMap tiles.

---

## Rules for the agent (read once, follow every step)
- Do ONLY the step you are asked for, run that step's CHECK, then stop and report the real check output. Do not plan or start later steps.
- ALL files go inside `live-earth-tracker/` (create it in STEP 1). Never create, edit or delete anything outside `live-earth-tracker/`. Never touch `echoloop`, `turbo-kart`, `turbo-kart-2`, `snakes-and-ladders` or any prompt file.
- Write real, working code to disk with the write tool. No placeholders, no TODO stubs, no fake values shown as real data.
- Never edit an earlier step's tests to make them pass; fix the code. Never delete a working feature.
- Do not claim something was tested unless you ran the command and saw the output.
- Tests must use the saved fixtures in `tests/fixtures/`, never the live internet (live APIs change and rate-limit).
- Every visible button must do what it says. No debug controls in the normal interface.
- SECRETS: the real logins are in `~/.secrets/live-earth.json`. NEVER open, read, cat, print, copy or grep that file or anything in `~/.secrets/`, and never ask for its contents. Only `server.js` (via `loadConfig`, STEP 7) reads it at runtime. Never put a key or secret in a project file, a test, the browser code, a log line, an error message or TEST_REPORT.md. Tests always inject FAKE config values (for example `llmApiKey: 'test-key'`).

## Tech (fixed, do not debate)
- Plain HTML + CSS + vanilla JavaScript ES modules in the browser. No frameworks, no bundler, no build step.
- Node 18+ for `server.js` and `watcher.js`, using only built-in modules (`node:http`, `node:fs`, `node:path`, `node:url`) and the global `fetch`. No npm dependencies at all.
- Leaflet 1.9.4 from the CDN, loaded in `index.html` BEFORE `src/main.js`:
  `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">` and `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>`. Browser code uses the global `L`. Pure-logic files must never use `L`.
- Map tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with the attribution `&copy; OpenStreetMap contributors` (required by the tile policy). `maxZoom: 18`, `worldCopyJump: true`.
- `package.json` (exactly): `{"name":"live-earth-tracker","private":true,"type":"module","scripts":{"start":"node server.js","test":"node --test tests/*.test.js","watch":"node watcher.js --every 10"}}`. Use the `tests/*.test.js` glob: on Node 24, `node --test tests/` fails.
- Port 8085 (`PORT` env var overrides it).
- Tests use `node:test` + `node:assert/strict`.
- **Pure-logic files must not touch the DOM, `L`, `fetch` or the clock directly** (time is passed in as `now` in milliseconds), so Node can test them: `src/geo.js`, `src/cities.js`, `src/iss.js`, `src/quakes.js`, `src/flights.js`, `src/ask.js`, `src/alerts.js`, `src/cache.js`.
- The BROWSER never calls the outside APIs directly. It only calls our own `server.js` endpoints (`/api/...`). The server fetches upstream, caches, and avoids CORS problems and rate limits.

## Data sources (verified formats, no key needed)
- **ISS now**: `GET https://api.wheretheiss.at/v1/satellites/25544` → `{ name, id, latitude, longitude, altitude (km), velocity (km/h), visibility, timestamp (UNIX seconds), ... }`. About 1 request per second allowed.
- **ISS future positions**: `GET https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=t1,t2,...&units=kilometers` → array of the same objects. **At most 10 timestamps per request.**
- **Earthquakes**: `GET https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` → GeoJSON `FeatureCollection`. Each feature: `id`, `properties.{ mag, place, time (ms), url, title, tsunami }`, `geometry.coordinates = [longitude, latitude, depthKm]`. Note the ORDER: longitude first. `mag` can be `null`.
- **Flights**: `GET https://opensky-network.org/api/states/all?lamin=..&lomin=..&lamax=..&lomax=..` → `{ time, states: [[icao24, callsign, origin_country, time_position, last_contact, longitude, latitude, baro_altitude (m), on_ground, velocity (m/s), true_track (deg from north), vertical_rate, sensors, geo_altitude, squawk, spi, position_source], ...] }`. `states` can be `null`. Callsigns have trailing spaces. Many fields can be `null`. Anonymous access is rate-limited and can return HTTP 429 or fail: the app must keep working and say "Flights temporarily unavailable" instead of breaking.
  - Credits: each request costs 1–4 credits depending on the box area (up to 25 square degrees = 1, up to 100 = 2, up to 400 = 3, more = 4). Anonymous users get about 400 credits per day; a free account gets about 4,000. Position data has 10-second resolution (5 s with an account).
  - Optional login (OAuth2 client credentials): `POST https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` with the form body `grant_type=client_credentials&client_id=..&client_secret=..` → `{ access_token, expires_in }`. Send `Authorization: Bearer <access_token>` on the states request. Cache the token until 60 s before it expires.

## Final file layout (inside live-earth-tracker/)
```
index.html  package.json  server.js  watcher.js  README.md  TEST_REPORT.md
src/ styles.css main.js map.js ui.js geo.js cities.js iss.js quakes.js flights.js ask.js alerts.js cache.js sources.js
tests/ geo.test.js iss.test.js quakes.test.js flights.test.js cache.test.js server.test.js ask.test.js alerts.test.js
tests/fixtures/ iss.json iss_positions.json quakes.geojson flights.json
data/   (created at runtime by the watcher: state.json, alerts.json)
reports/ (created at runtime by the watcher: YYYY-MM-DD.md)
```
`src/sources.js` holds the upstream fetch functions. It is shared by `server.js` and `watcher.js`, takes `fetchImpl` as a parameter, and is never imported by the browser.

---

## STEP 1: Skeleton, static server and page layout
Create `live-earth-tracker/package.json` (exactly as above), `live-earth-tracker/server.js`, `live-earth-tracker/index.html`, `live-earth-tracker/src/styles.css`, `live-earth-tracker/src/main.js`.
- `server.js` (static only for now): export `createApp(options)` that returns a `(req, res)` handler, and start listening on `PORT || 8085` ONLY when run directly (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`). Serve files from the `live-earth-tracker` folder with correct content types (html, js, css, json, png, svg). Block path traversal (any resolved path outside the folder → 403). Unknown file → 404.
- `index.html`: viewport meta, Leaflet CSS + JS from the CDN, `src/styles.css`, then `<script type="module" src="src/main.js">`. Layout:
  - `header.topbar`: the title "Live Earth Tracker", a `#clock` (UTC time), and a `#status-dot`.
  - `main.layout`: `#map` (fills the space) and `aside#panel` holding: `section#layers` (three checkboxes `#layer-iss`, `#layer-quakes`, `#layer-flights`, all checked), `section#stats` (empty `#stat-iss`, `#stat-quakes`, `#stat-flights`), `section#ask` (`#ask-log`, `form#ask-form` with `input#ask-input` and a submit button "Ask"), `section#alerts` (`ol#alert-list`).
  - `#info-card.hidden` (a floating card for details of a clicked item, with a `#info-close` button).
- `main.js` (for now): create the Leaflet map in `#map` centred on `[20, 78]` (India) at zoom 3 with the OpenStreetMap tile layer and attribution; update `#clock` every second.
- `styles.css`: a dark, modern theme (dark panel, light text, one accent colour); `#map` fills the page height minus the top bar; on screens under 800 px wide the panel goes BELOW the map; `.hidden { display:none !important }`.
CHECK: `cd live-earth-tracker && (node server.js >/dev/null 2>&1 &) && sleep 1 && curl -s localhost:8085/ | grep -c 'id="map"' && curl -s -o /dev/null -w "%{http_code}\n" localhost:8085/src/main.js && curl -s -o /dev/null -w "%{http_code}\n" "localhost:8085/../credentials.json"; pkill -f "node server.js"` → prints `1`, `200`, and `403` or `404` (never 200 for the traversal).

## STEP 2: Save real data fixtures
Create `live-earth-tracker/tests/fixtures/` and save REAL responses with curl (do not invent them):
- `curl -s -m 20 https://api.wheretheiss.at/v1/satellites/25544 -o tests/fixtures/iss.json`
- `iss_positions.json`: one call to the positions endpoint with 10 timestamps one minute apart starting now (build the list with `date +%s`).
- `curl -s -m 30 https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson -o tests/fixtures/quakes.geojson`
- `curl -s -m 30 "https://opensky-network.org/api/states/all?lamin=6&lomin=68&lamax=36&lomax=98" -o tests/fixtures/flights.json` (the India area).
- Check each file is valid JSON with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`.
- If a source fails (for example OpenSky returns 429 or empty), retry once after 15 seconds. If it still fails, write a SMALL fixture by hand that follows the format in "Data sources" exactly (at least 5 states, including one with `null` callsign/altitude, one `on_ground: true`, and one callsign with trailing spaces), and write in `TEST_REPORT.md` which fixture is hand-made and why.
- Create `TEST_REPORT.md` with a section "Fixtures" listing each file, its size, and whether it is real or hand-made.
CHECK: all 4 files exist and parse as JSON; print their sizes with `ls -l tests/fixtures`.

## STEP 3: Geography helpers (pure) + tests
Create `src/geo.js`, `src/cities.js` and `tests/geo.test.js`.
- `geo.js` exports:
  - `EARTH_RADIUS_KM = 6371`
  - `haversineKm(lat1, lon1, lat2, lon2)`: great-circle distance.
  - `normalizeLon(lon)` → a value in [-180, 180).
  - `bearingDeg(lat1, lon1, lat2, lon2)` → 0–360, where 0 = north and 90 = east.
  - `destinationPoint(lat, lon, bearingDeg, km)` → `{ lat, lon }`: the point reached by travelling `km` along a great circle from the start at that bearing (lon normalised). Used to move planes smoothly between updates.
  - `inBounds(lat, lon, b)` where `b = { south, west, north, east }`. Must handle a box that crosses the antimeridian (west > east).
  - `splitAtAntimeridian(points)`: points are `[lat, lon]`; returns an array of segments, starting a new segment whenever consecutive longitudes jump by more than 180°. (Without this, the ISS path draws a line across the whole map.)
  - `formatLatLon(lat, lon)` → for example `"22.57°N, 88.36°E"` (2 decimals, N/S/E/W).
  - `formatAgo(ms)` → `"just now"` (< 60 s), `"5 min ago"`, `"3 h ago"`.
- `cities.js` exports `CITIES`: an array of at least 40 `{ name, country, lat, lon }` covering the major Indian cities (Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad, Jaipur, Lucknow, Guwahati, Bhubaneswar and others) and world capitals and big cities (London, New York, Tokyo, Paris, Dubai, Singapore, Sydney, Beijing, Moscow, Cairo, São Paulo, Los Angeles and others), plus `findCity(text)` (case-insensitive, matches the city name anywhere in the text, prefers the longest match, returns null if none) and `nearestCity(lat, lon)` → `{ city, km }`.
Tests: Kolkata–Delhi distance is 1300–1330 km; London–New York is 5550–5600 km; the distance from a point to itself is 0; `normalizeLon(190) === -170` and `normalizeLon(-190) === 170`; bearing due east along the equator is 90 and due north is 0; `destinationPoint(0, 0, 90, 111.19)` is about `{ lat: 0, lon: 1 }` (±0.01) and travelling 100 km north then reading `haversineKm` back gives 100 ±0.1; inBounds works for a normal box and an antimeridian box; `splitAtAntimeridian` splits `[[0,170],[0,179],[0,-179],[0,-170]]` into 2 segments and leaves a path without a jump as 1 segment; `formatLatLon(-33.87, 151.21)` is `"33.87°S, 151.21°E"`; `findCity("flights over new delhi?")` finds Delhi; `findCity("hello")` is null; `nearestCity` of Kolkata's own coordinates is Kolkata at 0 km.
CHECK: `cd live-earth-tracker && npm test` → all pass.

## STEP 4: Earthquakes (pure) + tests
Create `src/quakes.js` and `tests/quakes.test.js`.
- `parseQuakes(geojson)` → an array of `{ id, mag, place, time, url, lat, lon, depthKm, tsunami }`, skipping features without coordinates. Remember coordinates are `[lon, lat, depth]`. A `null` mag becomes `0`.
- `quakeRadiusPx(mag)` → `4 + mag * 3`, clamped to [4, 30].
- `quakeColor(mag)` → `< 2.5` green `#3ecf8e`, `< 4.5` yellow `#f5c542`, `< 6` orange `#ff8c42`, otherwise red `#ff4d4f`.
- `filterQuakes(list, { minMag = 0, sinceMs = 0 })`, `sortByMag(list)` (biggest first; never mutates the input), `strongest(list)`.
- `quakeStats(list)` → `{ count, maxMag, strongest, countAbove: { 2.5: n, 4.5: n, 6: n } }`.
- `quakesNear(list, lat, lon, km)` → quakes within `km`, each with an added `distanceKm`, nearest first.
Tests (using `tests/fixtures/quakes.geojson` AND a small hand-written FeatureCollection inside the test for exact values): parsing gets lat/lon in the right order (check one known feature from the hand-written sample); a null mag becomes 0; radius and colour at the boundaries 2.5, 4.5 and 6; `sortByMag` doesn't mutate; stats counts are right for the hand-written sample; `quakesNear` filters and sorts by distance; the real fixture parses into at least 1 quake and every lat is in [-90, 90] and every lon in [-180, 180].
CHECK: `npm test` → all pass.

## STEP 5: ISS (pure) + tests
Create `src/iss.js` and `tests/iss.test.js`.
- `parseIss(json)` → `{ lat, lon, altKm, speedKmh, visibility, time }` where `time` is in MILLISECONDS (the API gives seconds).
- `createTrail(maxPoints = 300)` → `{ add(pos), points(), clear() }`. It keeps only the newest `maxPoints`, and ignores a point whose `time` equals the last one.
- `futureTimestamps(nowMs, minutes = 90, stepMin = 1)` → UNIX SECONDS, from now+1 min to now+90 min.
- `chunk(list, size = 10)` → arrays of at most 10 (the API's limit).
- `findPasses(predicted, city, radiusKm = 1000)` → a list of `{ start, end, closestKm, closestTime }` for each continuous run of predicted points within `radiusKm` of the city. Empty list if none.
- `issSummary(pos, nearestCityResult)` → a human sentence, for example `"The ISS is over the Indian Ocean, 1,240 km from Chennai, at 418 km altitude, moving at 27,600 km/h."` Use "over land near <city>" when within 500 km of the nearest city, otherwise "over the ocean/remote area, <km> km from <city>".
Tests: `parseIss` on the fixture converts seconds to ms and keeps the numbers; the trail cap and duplicate-time rule; `futureTimestamps` returns 90 values 60 s apart in seconds; `chunk` of 90 gives 9 chunks of 10; `findPasses` on a hand-made track that goes over a city returns exactly 1 pass with the right closest point, and returns `[]` for a track that never comes close; `issSummary` contains the altitude and speed rounded with thousands separators.
CHECK: `npm test` → all pass.

## STEP 6: Flights (pure) + tests
Create `src/flights.js` and `tests/flights.test.js`.
- `parseFlights(json)` → an array of `{ icao24, callsign, country, lat, lon, altM, onGround, speedKmh, heading, verticalRate, lastContact }`. Trim callsigns (an empty one becomes `null`). Convert m/s to km/h (× 3.6). Skip states with a null lat or lon. A null `states` gives `[]`.
- `flightLabel(f)` → the callsign, or `icao24` uppercased if there is no callsign.
- `filterFlights(list, { bounds, airborneOnly = true })`.
- `limitFlights(list, max = 400)`: the browser draws at most 400 planes; keep the ones nearest the given centre `{ lat, lon }`.
- `flightStats(list)` → `{ count, airborne, onGround, topCountries: [[country, n] ...top 5] }`.
- `extrapolateFlight(f, dtMs)` → a NEW flight object moved forward by `speedKmh × dt` along `heading` using `destinationPoint`. On-ground planes, planes with a null speed or heading, and any `dtMs` over 120,000 are returned unchanged (never guess further than 2 minutes). Never mutates the input.
- `boundsToQuery(b)` → `"lamin=..&lomin=..&lamax=..&lomax=.."`, rounded to 2 decimals and clamped to valid lat/lon.
Tests: on the fixture, every parsed flight has numeric lat/lon; trailing spaces in callsigns are trimmed; null callsigns fall back to icao24; speed conversion (100 m/s → 360 km/h); the airborne filter drops on-ground planes; `limitFlights` keeps the nearest planes; `boundsToQuery` clamps values (lat 95 → 90); `extrapolateFlight` of a plane at 900 km/h heading 90 for 60 s moves it 15 km east (±0.1), leaves on-ground planes unchanged, doesn't mutate, and refuses dt over 2 minutes; a JSON with `states: null` gives `[]`.
CHECK: `npm test` → all pass.

## STEP 7: Server API with caching + tests
Create `src/cache.js`, `src/sources.js`, `tests/cache.test.js` and `tests/server.test.js`; extend `server.js`.
- `cache.js`: `createCache()` → `{ get(key, now), set(key, value, ttlMs, now) }`. `get` returns `undefined` after the TTL. Also `async cached(cache, key, ttlMs, now, loader)`: returns the cached value, or calls `loader()` once and stores it. If the loader throws and an OLD value exists, return the old value with `stale: true`; if there is no old value, rethrow.
- `sources.js`: `fetchIss(fetchImpl)`, `fetchIssPath(fetchImpl, nowMs)` (calls the positions endpoint in 9 chunks of 10 timestamps, waiting 1100 ms between calls to respect the rate limit, and returns 90 parsed points), `fetchQuakes(fetchImpl)`, `fetchFlights(fetchImpl, bounds)`. Each throws an Error with the HTTP status when the response is not OK. Each uses a 15-second timeout (`AbortSignal.timeout(15000)`).
- `server.js` routes (all return JSON `{ ok: true, data, stale, fetchedAt }` or `{ ok: false, error }` with status 502):
  - `GET /api/iss` (cache 2 s)
  - `GET /api/iss/path` (cache 10 min)
  - `GET /api/quakes` (cache 60 s)
  - `GET /api/flights?south=..&west=..&north=..&east=..` (cache per bounds rounded to 1 decimal: 15 s when OpenSky login is set, 50 s anonymous. If `config.openskyClientId` and `config.openskyClientSecret` are set, `fetchFlights` gets and caches the OAuth token as described in "Data sources"; if the token request fails, fall back to anonymous and log it once; if upstream says 429, back off: return the stale data or `{ ok:false, error:"Flights temporarily unavailable (rate limited)" }` and don't call upstream again for 60 s)
  - `GET /api/config` → `{ llm: false, openskyAuth: true|false, intervals: { issMs: 2000, flightsMs: 20000 or 60000, quakesMs: 60000 } }` (flightsMs is 20000 with OpenSky login, else 60000). Never include any secret. STEP 11 sets `llm`.
  - `loadConfig({ env = process.env, secretsPath })` in `server.js` → `{ llmApiKey, llmBaseUrl, llmModel, llmFallbackModel, llmMaxTokens, openskyClientId, openskyClientSecret }` (`llmMaxTokens` defaults to 8000). `secretsPath` defaults to `env.SECRETS_FILE` or `~/.secrets/live-earth.json` (use `os.homedir()`; this needs `node:os`). It reads that JSON file if it exists (a missing or broken file just means empty values, logged once WITHOUT its contents); then environment variables override it: `LLM_API_KEY` (or `SOKET_API_KEY`), `LLM_BASE_URL` (default `https://api.soket.ai/v1`), `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `LLM_MAX_TOKENS`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`. At startup print only which features are on, for example `AI answers: on (GLM-5.3, backup llama-3.1-8b-instruct) · OpenSky login: on`, never the values.
  - `createApp({ fetchImpl = fetch, now = Date.now, root, config })`, so tests can inject a fake fetch, a fake clock and a fake config. When run directly, `config = loadConfig()`.
- Tests: `loadConfig` with a temporary JSON file in the OS temp dir (fake values) reads it, env vars override it, and a missing file gives empty values without throwing; the OAuth token is requested once and reused until near expiry (fake fetch + fake clock); `/api/config` never contains the client secret; cache expiry; `cached` calls the loader once within the TTL; a stale value is returned when the loader fails. For the server: start `createApp` with a FAKE fetch that returns the fixtures, on port 0 (`server.listen(0)`), then call each route with the real `fetch`, check `ok: true` and the data shape, check that a second call within the TTL does NOT call the fake fetch again, and check that a fake 429 for flights returns `ok: false` with the friendly message (not a crash). No test may use the real internet.
CHECK: `npm test` → all pass. Then `node server.js` and `curl -s localhost:8085/api/quakes | head -c 300` shows real data (if the network is down, report that honestly).

## STEP 8: The live map (rendering)
Create `src/map.js`; update `src/main.js`.
- `map.js` exports `createLayers(map)` → `{ iss, quakes, flights }`. Each is a Leaflet `layerGroup` with an `update(data)` method:
  - ISS: a custom `L.divIcon` (🛰️ inside a glowing circle), a trail polyline (solid, accent colour), and the predicted path (dashed, lighter), both split with `splitAtAntimeridian`. A popup with `issSummary`.
  - Quakes: `L.circleMarker` with `quakeRadiusPx` and `quakeColor`, `fillOpacity` 0.6; quakes newer than 1 hour get a CSS pulse ring. A popup with magnitude, place, depth, `formatAgo`, and a "USGS details" link (`target="_blank" rel="noopener"`).
  - Flights: an `L.divIcon` with ✈ rotated by `heading` (CSS `transform: rotate(...)`, minus 45° if the glyph points north-east). Update existing markers by `icao24` instead of recreating them all (no flicker). A popup with label, country, altitude in m and ft, speed, and heading.
- `main.js` polling: read the intervals from `/api/config` once at start. ISS every 2 s, ISS path every 10 min, quakes every 60 s, flights every `flightsMs` (20 s with OpenSky login, 60 s without) AND 1 s after the map stops moving (`moveend`, debounced), always using the current map bounds. Flights only load when zoom ≥ 4; below that show the hint "Zoom in to see flights". **Use ONE scheduler**: it pauses when the tab is hidden (`visibilitychange`) and never creates duplicate intervals. A failing source must not stop the others: show its error in its stats line and keep the old markers.
- **Real-time motion** (this is what makes it feel live): ONE `requestAnimationFrame` loop (started once, never duplicated, paused when the tab is hidden) that every frame:
  - moves each plane marker to `extrapolateFlight(lastData, now - fetchedAt)`, so planes fly smoothly between updates instead of jumping every 20–60 s; when new data arrives, the marker continues from where it is drawn to the new position over 1 s (no jump back);
  - glides the ISS marker from its previous position to the newest one over 2 s (the ISS moves about 15 km in 2 s), handling the antimeridian (never glide the long way round the world).
  - Show a small "LIVE" pulse next to each layer name while its data is fresh (younger than 2× its interval) and "stale" otherwise.
- Unchecking a layer checkbox removes that layer from the map and pauses its polling. Checking it again re-adds it and fetches right away.
CHECK: `node --check` on every file in src/; `npm test` passes; start the server and take a headless screenshot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=1280,800 --virtual-time-budget=10000 --screenshot=/tmp/g5-step8.png http://localhost:8085/` and say what is visible (map tiles, ISS icon, quake circles). Then stop the server.

## STEP 9: Panel, stats and details
Create `src/ui.js`; update `main.js` and `styles.css`.
- Stats: `#stat-iss` shows the position (`formatLatLon`), altitude, speed and "updated X ago"; `#stat-quakes` shows the count in 24 h, the strongest (mag and place), and how many are ≥ 4.5; `#stat-flights` shows the planes in view, the airborne count, and the top 3 countries. Each line shows a red "!" with the error text when its source fails.
- Clicking a marker opens `#info-card` with the full details (popups stay short); `#info-close` hides it.
- A "Follow ISS" toggle button in the ISS stats: when on, the map pans to the ISS on every update.
- A city search box above the layers (`input#city-search`, using `findCity`): pressing Enter flies to the city at zoom 6 and draws a 1000 km circle around it, which becomes the "selected city" for the ISS pass check. Show "Next ISS pass near <city>: in 37 min (closest 420 km)" or "No ISS pass near <city> in the next 90 minutes" using `findPasses` on the predicted path.
- A "📍 My location" button: uses `navigator.geolocation`; on success it acts like the city search with the user's position; on failure it shows a short message (never an uncaught error).
- A legend in the bottom-left corner of the map: the quake colours by magnitude, the ISS, and a flight.
- `#status-dot`: green when all enabled sources are OK, yellow when any is stale or failing, red when all fail.
CHECK: `node --check` every file; `npm test` passes; headless screenshot at 1280×800 AND at 390×844 (phone), and say what is visible in each.

## STEP 10: "Ask the map" with the built-in answerer (pure) + tests
Create `src/ask.js` and `tests/ask.test.js`; wire up `#ask-form` in `ui.js`.
- `answerLocal(question, snapshot)` → `{ answer, action }`, where `action` is `null` or `{ type: 'flyTo', lat, lon, zoom }` or `{ type: 'highlight', layer, ids }`. `snapshot` = `{ iss, issPath, quakes, flights, flightsBounds, selectedCity, now }`. Recognise these intents (case-insensitive; use `findCity` for city names):
  - where is the ISS / space station → `issSummary` + flyTo the ISS (zoom 4).
  - when will the ISS pass over <city> → the `findPasses` result in words + flyTo the city.
  - biggest / strongest earthquake → mag, place, `formatAgo` + flyTo it (zoom 6) + highlight it.
  - how many earthquakes (optionally "above N") → a count from `filterQuakes`.
  - earthquakes near <city> → `quakesNear(…, 1000)`: a count and the nearest one + flyTo the city.
  - flights / planes over <city> → if the city is inside `flightsBounds`, count the flights within 150 km of it and name up to 3 callsigns; otherwise answer "Move the map to <city> first, I only have flights for the current view" + flyTo the city (zoom 7) so the next poll loads them.
  - help / anything else → a short list of example questions.
- `ui.js`: append the question and answer to `#ask-log` as chat bubbles, run the action on the map, and keep the log scrolled to the bottom. Add 4 clickable example-question chips under the input.
Tests: every intent above with a hand-made snapshot (exact numbers in the answers); unknown questions give the help text; a missing city in "flights over xyz" doesn't crash; the action coordinates are numbers.
CHECK: `npm test` → all pass.

## STEP 11: "Ask the map" with a real LLM agent (optional key) + tests
Extend `server.js` with `POST /api/ask` and `ask.js` with prompt helpers; extend `tests/server.test.js` and `tests/ask.test.js`.
- Use `config.llmApiKey`, `config.llmBaseUrl`, `config.llmModel` and `config.llmFallbackModel` from `loadConfig` (STEP 7). The main model is `GLM-5.3`; the backup is `llama-3.1-8b-instruct`. Measured on Soket: GLM-5.3 gives the best answers but ALWAYS thinks first, using about 1,800–2,000 reasoning tokens and about 30–35 s even for a one-line question (with `max_tokens: 2000` it returned EMPTY content because all tokens went to reasoning). llama-3.1-8b-instruct answers in about 2 s with no thinking. If the key or the model is missing, `/api/ask` returns `{ ok: true, mode: 'local' }` and the browser uses `answerLocal`. `/api/config` sets `llm: true|false` (NEVER the key).
- `ask.js` adds:
  - `buildSnapshotForLlm(snapshot)` → a COMPACT JSON: the ISS position and summary, the next pass for the selected city, the 15 strongest quakes `{id, mag, place, lat, lon, agoMin}`, the flight stats and 15 flights in view `{callsign, country, lat, lon, altM, speedKmh}`, the map bounds and the current UTC time. It must stay under 6,000 characters (test this with the real fixtures).
  - `buildMessages(question, compactSnapshot)` → OpenAI chat `messages`: a system message saying it is the Live Earth Tracker assistant, must answer ONLY from the data given, must say so when the data doesn't contain the answer, and must reply with ONLY a JSON object `{"answer": string, "action": null | {"type":"flyTo","lat":n,"lon":n,"zoom":n} | {"type":"highlight","layer":"quakes"|"flights"|"iss","ids":[...]}}`.
  - `parseLlmReply(text)` → `{ answer, action }`. It extracts the first `{...}` block even if the model wraps it in text or code fences, validates the action (lat in [-90, 90], lon in [-180, 180], zoom 2–12, a known layer), drops an invalid action, and falls back to `{ answer: text.trim(), action: null }` if there is no valid JSON.
- `/api/ask` body `{ question, snapshot, fast }` (when `fast` is true, skip the main model and call `llmFallbackModel` directly) (the browser sends its current snapshot; cap the body at 100 KB) → calls `${LLM_BASE_URL}/chat/completions` with `{ model, messages, temperature: 0.2, max_tokens: config.llmMaxTokens }` (8000 for GLM; never below 6000 for a thinking model). Do NOT send `reasoning_effort`, `enable_thinking` or other non-standard fields (some providers reject them with 400/502). Thinking models (GLM, qwen3) spend most of `max_tokens` on reasoning, which is why it is 8000: read ONLY `choices[0].message.content` (ignore `reasoning_content`), and treat empty content as an LLM error. Content may start with blank lines: trim it. Timeout 90 s for the main model (GLM); if it fails, times out or returns empty content, try `llmFallbackModel` once (timeout 20 s); the reply includes `model` so the UI can show which one answered. If both fail, return `{ ok: true, mode: 'local', note: 'AI unavailable, used built-in answers' }` so the browser falls back.
- UI: the ask box shows a small "AI" or "Built-in" badge from `/api/config`, a typing indicator "GLM is thinking… 12 s" with a live seconds counter while waiting (GLM takes about 30–40 s), and a "Quick answer" link that cancels the wait (`AbortController`) and re-asks with `{ fast: true }` so the server uses the backup model directly, and under each AI answer the model name in small grey text. Built-in intents that `answerLocal` recognises (STEP 10) answer INSTANTLY without the LLM; only other questions go to `/api/ask`.
Tests: `parseLlmReply` on clean JSON, JSON inside ```json fences, JSON after some prose, an out-of-range flyTo (action dropped), and plain text with no JSON (fallback); the snapshot size limit; server tests with a fake fetch that returns an OpenAI-style `{choices:[{message:{content:"..."}}]}` → `/api/ask` returns the parsed answer; with no key → `mode: 'local'`; the main model failing → the fallback model answers;  `/api/config` never contains the key; an empty `content` (only `reasoning_content`) falls back to `mode: 'local'`.
CHECK: `npm test` → all pass.

## STEP 12: The watcher agent (alerts + daily report) + tests
Create `src/alerts.js`, `watcher.js` and `tests/alerts.test.js`; add `GET /api/alerts` to `server.js`; show the alerts in the panel.
- `alerts.js` (pure):
  - `newQuakeAlerts(quakes, seenIds, { minMag = 5.0 })` → `{ alerts, seenIds }`: one alert per quake with mag ≥ minMag not seen before. `seenIds` is a plain array capped at the newest 2,000 ids.
  - `issPassAlerts(passes, city, alreadyAlerted)` → alerts for passes starting in the next 90 min that haven't been alerted yet (key: city name + pass start rounded to 10 minutes).
  - An alert object: `{ id, kind: 'quake'|'iss', title, detail, lat, lon, time }`.
  - `buildDailyReport(dateStr, quakes, alerts, issPositions)` → Markdown: a title, counts by magnitude band, the 5 strongest quakes as a table, a list of today's alerts, and how many ISS positions were sampled. Pure and deterministic.
- `watcher.js`: `node watcher.js --once` does one check; `node watcher.js --every 10` repeats every 10 minutes. Each check: fetch quakes, the ISS and the ISS path (via `sources.js`), compute alerts, append them to `data/alerts.json` (keep the newest 100), save `data/state.json` (seenIds, alerted passes, `lastRun`), and rewrite `reports/<YYYY-MM-DD>.md` (UTC date) with `buildDailyReport`. The home city comes from the `HOME_CITY` env var (default `Kolkata`, resolved with `findCity`). It prints one line per alert plus a summary line. On the FIRST run it marks all existing quakes as seen without alerting (no flood of old alerts); log that it did so. Network errors are logged and the watcher keeps running.
- `GET /api/alerts` → the contents of `data/alerts.json` (empty list if it is missing). The browser loads it every 60 s into `#alert-list` (newest first; clicking an alert flies to it) and shows a badge with the unread count.
Tests: `newQuakeAlerts` alerts only new quakes above the threshold and never alerts the same id twice; the seenIds cap; `issPassAlerts` de-duplicates; `buildDailyReport` contains the table header, the strongest quake, and the alert titles; the first-run rule (test the pure function that decides it).
CHECK: `npm test` passes; run `node watcher.js --once` and show its output plus `ls data reports` (if the network is down, report that honestly).

## STEP 13: Polish
- Use a dark map style that matches the theme: apply the CSS filter `.leaflet-tile-pane { filter: brightness(0.75) invert(1) contrast(0.9) hue-rotate(200deg) saturate(0.4); }` behind a "Dark map" toggle (on by default) that is saved in `localStorage` (wrapped in try/catch).
- Check the real-time motion from STEP 8: planes glide continuously, the ISS glides, and there is exactly ONE animation loop (add a guard so calling the start function twice does nothing).
- An "Earth now" summary strip under the top bar: "🛰️ ISS over <area> · 🌍 <n> quakes today, strongest M<x> · ✈ <n> planes in view". It updates live.
- Keyboard: `/` focuses the ask box; `Esc` closes the info card.
- Loading states: a skeleton shimmer in each stats line until its first data arrives.
- Make sure there are no console errors and no 404s (check the Network panel URLs: Leaflet's marker images are not needed, because we only use divIcons and circleMarkers).
CHECK: `node --check` every file; `npm test` passes; headless screenshots at 1280×800 and 390×844, and say what is visible.

## STEP 14: Verify and document
1. `npm test` → all pass. `for f in server.js watcher.js src/*.js; do node --check "$f" || echo "FAIL $f"; done` → no FAIL.
2. Start the server; `curl` each endpoint (`/api/iss`, `/api/iss/path`, `/api/quakes`, `/api/flights?south=6&west=68&north=36&east=98`, `/api/alerts`, `/api/config`) and record the status and the first 150 characters of each.
3. Headless screenshots: the full page at 1280×800 and 390×844. Say what is visible in each.
4. Run `node watcher.js --once` and record its output.
5. `README.md`: what it is; how to run it (`npm start` → http://localhost:8085); how logins work (`~/.secrets/live-earth.json` with the field names only, plus the environment variables that override it; NEVER real values); the OpenSky credit limits; how the real-time motion works (data every 2–60 s, smooth movement in between); how to run the watcher (`npm run watch`, `HOME_CITY`); example questions; the data sources and their limits (OpenSky anonymous rate limits, ISS predicted path covers 90 minutes); the OpenStreetMap attribution; and an optional loop tie-in: `loop --print "Read live-earth-tracker/reports/<today>.md and data/alerts.json and write a 5-line summary of what happened on Earth today"`.
6. `TEST_REPORT.md`: the test count, what each check above showed (real output, honest), which sources were down or rate-limited during testing, and what still needs a human to check (real geolocation permission, the AI answers with a real key, long-running watcher).
7. Delete any temporary files you created inside `live-earth-tracker/` (screenshots belong in /tmp). Do not delete `data/` or `reports/`.
Finish with a short summary: the files, the test results, and how to run it.
