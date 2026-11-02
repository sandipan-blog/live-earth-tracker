// Watcher agent: periodic checks, alerts and a daily report.
// Usage: node watcher.js --once | node watcher.js --every 10

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchQuakes, fetchIss, fetchIssPath } from './src/sources.js';
import { findCity } from './src/cities.js';
import { findPasses } from './src/iss.js';
import {
  newQuakeAlerts,
  issPassAlerts,
  buildDailyReport,
  isFirstRun
} from './src/alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_DIR = path.join(__dirname, 'reports');

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
}

async function runCheck() {
  const now = Date.now();
  const state = readJson(path.join(DATA_DIR, 'state.json'), null);
  const first = isFirstRun(state);

  const homeName = process.env.HOME_CITY || 'Kolkata';
  const home = findCity(homeName) || findCity('Kolkata');

  // ---- fetch (network errors are logged; the watcher keeps running) ----
  let quakes = [];
  let issPos = null;
  let issPath = [];
  try {
    quakes = await fetchQuakes(fetch);
  } catch (err) {
    console.log(`[watcher] quake fetch failed: ${err.message}`);
  }
  try {
    issPos = await fetchIss(fetch);
  } catch (err) {
    console.log(`[watcher] ISS fetch failed: ${err.message}`);
  }
  try {
    issPath = await fetchIssPath(fetch, now);
  } catch (err) {
    console.log(`[watcher] ISS path fetch failed: ${err.message}`);
  }

  // ---- alerts ----
  const seenIds = first ? [] : state.seenIds || [];
  const quakeResult = newQuakeAlerts(quakes, seenIds, { minMag: 5.0 });
  let quakeAlerts = quakeResult.alerts;
  if (first && quakes.length > 0) {
    console.log('[watcher] first run: marking all existing quakes as seen without alerting');
    quakeAlerts = [];
  }

  let issAlerts = [];
  let alertedPassKeys = state?.alertedPassKeys || [];
  if (issPath.length > 0 && home) {
    const passes = findPasses(issPath, home, 1000);
    const r = issPassAlerts(passes, home, alertedPassKeys, now);
    if (!first) issAlerts = r.alerts;
    alertedPassKeys = r.keys;
  }

  const newAlerts = [...quakeAlerts, ...issAlerts];

  // ---- persist alerts.json (keep newest 100) ----
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  const oldAlerts = readJson(alertsPath, []);
  const allAlerts = [...newAlerts, ...oldAlerts]
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
    .sort((a, b) => b.time - a.time)
    .slice(0, 100);
  writeJson(alertsPath, allAlerts);

  // ---- persist state ----
  writeJson(path.join(DATA_DIR, 'state.json'), {
    seenIds: quakeResult.seenIds,
    alertedPassKeys,
    lastRun: now
  });

  // ---- daily report ----
  const dateStr = new Date(now).toISOString().slice(0, 10);
  const report = buildDailyReport(dateStr, quakes, allAlerts.filter((a) => a.time >= startOfUtcDay(now)), issPath);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, `${dateStr}.md`), report);

  // ---- output ----
  for (const a of newAlerts) {
    console.log(`ALERT [${a.kind}] ${a.title} — ${a.detail}`);
  }
  console.log(
    `[watcher] ${dateStr}: ${quakes.length} quakes checked, ${newAlerts.length} new alerts, ` +
    `${issPath.length} ISS path points, home city ${home ? home.name : '?'}`
  );
}

function startOfUtcDay(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ---- cli ----
const args = process.argv.slice(2);
if (args.includes('--once')) {
  runCheck().catch((e) => console.log(`[watcher] fatal: ${e.message}`));
} else {
  const everyIdx = args.indexOf('--every');
  const minutes = everyIdx !== -1 ? parseFloat(args[everyIdx + 1]) || 10 : 10;
  console.log(`[watcher] running every ${minutes} min`);
  const loop = () =>
    runCheck().catch((e) => console.log(`[watcher] fatal: ${e.message}`));
  loop();
  setInterval(loop, minutes * 60 * 1000);
}
