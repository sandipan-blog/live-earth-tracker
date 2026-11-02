// Upstream API fetchers. Shared by server.js and watcher.js. Never imported by the browser.
// Each function takes a fetchImpl so tests can inject fakes.

import { parseIss, futureTimestamps, chunk } from './iss.js';
import { parseQuakes } from './quakes.js';
import { boundsToQuery } from './flights.js';

const TIMEOUT_MS = 15000;

async function getJson(fetchImpl, url, options = {}) {
  const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchIss(fetchImpl) {
  const json = await getJson(fetchImpl, 'https://api.wheretheiss.at/v1/satellites/25544');
  return parseIss(json);
}

export async function fetchQuakes(fetchImpl) {
  const json = await getJson(
    fetchImpl,
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
  );
  return parseQuakes(json);
}

export async function fetchFlights(fetchImpl, bounds, authToken) {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const json = await getJson(
    fetchImpl,
    `https://opensky-network.org/api/states/all?${boundsToQuery(bounds)}`,
    { headers }
  );
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchIssPath(fetchImpl, nowMs, { waitBetweenChunks = true } = {}) {
  const timestamps = futureTimestamps(nowMs, 90, 1); // 90 unix seconds
  const chunks = chunk(timestamps, 10); // 9 chunks
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && waitBetweenChunks) await sleep(1100); // rate limit: ~1 req/s
    const url =
      `https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=` +
      chunks[i].join(',') +
      '&units=kilometers';
    const arr = await getJson(fetchImpl, url);
    for (const p of arr) points.push(parseIss(p));
  }
  return points;
}
