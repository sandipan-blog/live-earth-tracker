# Live Earth Tracker

A live world map in the browser that tracks three real things at once, plus an AI agent on top:

1. **ISS** — live position, trail, predicted path for the next 90 minutes, and pass checks near a chosen city.
2. **Earthquakes** — every quake from the last 24 hours as circles sized and coloured by magnitude (USGS).
3. **Flights** — live aircraft over the current map view as plane icons rotated to their heading (OpenSky).
4. **Ask the map** — a chat box. Ask in plain English; the built-in answerer replies instantly for known intents, and an LLM agent (GLM-5.3 with a llama-3.1-8b-instruct backup) answers everything else and moves the map to the answer.
5. **Watcher agent** — a background script that checks the data every few minutes, raises alerts and writes a daily report.

All data is free and needs no API key. The map is Leaflet with OpenStreetMap tiles.

**Built with [Loop](https://loop.cursor.com)** — written step-by-step from a loop agent prompt (`prompt.md`), not a hand-coded from-scratch app.

## Live demo

**https://live-earth-tracker.vercel.app**

(Also available at https://game5-ten.vercel.app)

## Run it

```
cd live-earth-tracker
npm start          # → http://localhost:8085  (PORT env var overrides)
npm test           # node --test tests/*.test.js (no internet needed)
npm run watch      # the watcher agent, every 10 minutes
node watcher.js --once   # one check now
```

Node 18+ required. No npm dependencies at all — only Node built-ins and the global `fetch`.

## How logins work (optional)

The server reads `~/.secrets/live-earth.json` (outside this project, readable only by you) by itself at startup — `npm start` is all you need. Field names (never paste real values anywhere in this repo):

- `llmApiKey`, `llmBaseUrl`, `llmModel`, `llmFallbackModel`, `llmMaxTokens` — the Soket key for AI answers (GLM-5.3 main, llama-3.1-8b-instruct backup)
- `openskyClientId`, `openskyClientSecret` — a free OpenSky account for more flight credits and faster updates

Environment variables override the file: `LLM_API_KEY` (or `SOKET_API_KEY`), `LLM_BASE_URL`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `LLM_MAX_TOKENS`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `SECRETS_FILE`. Without any login everything still works: AI questions fall back to the built-in answerer and flights use anonymous OpenSky access.

## OpenSky credit limits

Each flights request costs 1–4 credits depending on the box area (≤25 square degrees = 1, ≤100 = 2, ≤400 = 3, more = 4). Anonymous users get ~400 credits/day (~4,000 with a free account); position data has 10-second resolution (5 s with an account). The app caches per-bounds (15 s with login, 50 s anonymous), backs off for 60 s on HTTP 429, and shows "Flights temporarily unavailable" instead of breaking.

## How the real-time motion works

Data arrives every 2 s (ISS), 20–60 s (flights), 60 s (quakes) and 10 min (ISS path). Between updates, ONE `requestAnimationFrame` loop moves each plane along its heading at its speed (`extrapolateFlight`, never further than 2 minutes ahead) and glides the ISS marker over 2 s — handling the antimeridian so it never glides the long way round the world. The loop pauses when the tab is hidden; the scheduler pauses too and never creates duplicate intervals.

## Watcher

`npm run watch` (or `HOME_CITY="Mumbai" node watcher.js --every 10`) fetches quakes, the ISS and its predicted path, raises alerts for new M5+ quakes and ISS passes over the home city (default Kolkata), saves `data/state.json` + `data/alerts.json` (newest 100) and rewrites `reports/<YYYY-MM-DD>.md`. On the first run it marks all existing quakes as seen without alerting, so there is no flood of old alerts. Network errors are logged and the watcher keeps running.

## Example questions

- "Where is the ISS?"
- "When will the ISS pass over Delhi?"
- "Biggest earthquake today?"
- "How many earthquakes above 4?"
- "Earthquakes near Tokyo?"
- "Flights over London?"

Anything else goes to the AI agent. A "Quick answer" link cancels a slow GLM reply and re-asks with the fast backup model.

## Data sources and limits

- **ISS**: api.wheretheiss.at — ~1 request/second; the predicted path is fetched in 9 chunks of 10 timestamps (the API limit) with 1100 ms between calls, covering the next 90 minutes.
- **Earthquakes**: USGS all_day GeoJSON feed — every quake in the last 24 h.
- **Flights**: OpenSky `states/all` — see the credit limits above; anonymous access can return 429.
- **AI**: `${LLM_BASE_URL}/chat/completions` (Soket, GLM-5.3 + llama-3.1-8b-instruct).

Map tiles © OpenStreetMap contributors (required attribution, shown bottom-right).

## Loop tie-in (optional)

```
loop --print "Read live-earth-tracker/reports/<today>.md and data/alerts.json and write a 5-line summary of what happened on Earth today"
```
