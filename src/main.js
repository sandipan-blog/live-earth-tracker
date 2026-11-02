// Live Earth Tracker — entry point.

import { extrapolateFlight } from './flights.js';
import { quakeStats } from './quakes.js';
import { nearestCity } from './cities.js';
import { createLayers } from './map.js';
import { createUi } from './ui.js';

// ---------- clock ----------
const clockEl = document.getElementById('clock');
function updateClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  clockEl.textContent =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}
updateClock();
setInterval(updateClock, 1000);

// ---------- map ----------
const map = L.map('map', { center: [20, 78], zoom: 3, worldCopyJump: true });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const layers = createLayers(map);
const layerByName = { iss: layers.iss, quakes: layers.quakes, flights: layers.flights };

// ---------- state ----------
const state = {
  intervals: { issMs: 2000, flightsMs: 60000, quakesMs: 60000 },
  lastData: { iss: null, issPath: null, quakes: null, flights: null },
  fetchedAt: { iss: 0, issPath: 0, quakes: 0, flights: 0 },
  errors: { iss: null, quakes: null, flights: null },
  enabled: { iss: true, quakes: true, flights: true },
  followIss: false,
  selectedCity: null,
  issGlide: null // { fromLat, fromLon, toLat, toLon, start }
};

const ui = createUi(map, layers, state);
state.onUpdate = updateEarthNow;

// ---------- fetch helper ----------
async function getJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function setError(name, msg) {
  state.errors[name] = msg;
  const el = document.getElementById(`stat-${name}`);
  if (el) el.innerHTML = `<span class="error">! ${msg}</span>`;
}

function clearError(name) {
  state.errors[name] = null;
}

// ---------- ISS ----------
async function loadIss() {
  try {
    const j = await getJson('/api/iss');
    const prev = state.lastData.iss;
    const pos = j.data;
    if (prev) {
      // glide from the previous drawn position over 2 s, never the long way round
      let fromLon = prev.lon;
      if (Math.abs(pos.lon - fromLon) > 180) {
        fromLon += pos.lon > fromLon ? 360 : -360;
      }
      state.issGlide = {
        fromLat: prev.lat, fromLon,
        toLat: pos.lat, toLon: pos.lon,
        start: performance.now(), duration: 2000
      };
    }
    state.lastData.iss = pos;
    state.fetchedAt.iss = Date.now();
    clearError('iss');
    layers.iss.update(pos);
    ui.refresh();
    if (state.followIss) map.panTo([pos.lat, pos.lon], { animate: true });
  } catch (e) {
    setError('iss', e.message);
  }
}

async function loadIssPath() {
  try {
    const j = await getJson('/api/iss/path');
    state.lastData.issPath = j.data;
    state.fetchedAt.issPath = Date.now();
    layers.iss.updatePath(j.data);
    ui.refresh();
  } catch {
    /* path is optional decoration; keep the old one */
  }
}

// ---------- quakes ----------
async function loadQuakes() {
  try {
    const j = await getJson('/api/quakes');
    state.lastData.quakes = j.data;
    state.fetchedAt.quakes = Date.now();
    clearError('quakes');
    layers.quakes.update(j.data, Date.now());
    ui.refresh();
  } catch (e) {
    setError('quakes', e.message);
  }
}

// ---------- flights ----------
let flightsBounds = null;

function currentBounds() {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

async function loadFlights() {
  if (!state.enabled.flights) return;
  if (map.getZoom() < 4) {
    setError('flights', 'Zoom in to see flights');
    return;
  }
  const b = currentBounds();
  const q = `south=${b.south.toFixed(1)}&west=${b.west.toFixed(1)}&north=${b.north.toFixed(1)}&east=${b.east.toFixed(1)}`;
  try {
    const j = await getJson(`/api/flights?${q}`);
    flightsBounds = b;
    state.lastData.flights = j.data;
    state.fetchedAt.flights = Date.now();
    clearError('flights');
    layers.flights.update(j.data);
    ui.refresh();
  } catch (e) {
    setError('flights', e.message);
  }
}

// ---------- ONE scheduler ----------
const timers = {}; // name -> { intervalMs, timer, fn }

function schedule(name, intervalMs, fn) {
  unschedule(name);
  timers[name] = { intervalMs, timer: setInterval(fn, intervalMs), fn };
}

function unschedule(name) {
  const t = timers[name];
  if (t) {
    clearInterval(t.timer);
    delete timers[name];
  }
}

function pauseAll() {
  for (const name of Object.keys(timers)) unschedule(name);
}

function resumeAll() {
  for (const [name, t] of Object.entries(timers)) schedule(name, t.intervalMs, t.fn);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAll();
  else resumeAll();
});

// ---------- ONE animation loop ----------
let animStarted = false;

function startAnimationLoop() {
  if (animStarted) return;
  animStarted = true;

  function frame() {
    if (!document.hidden) {
      const nowMs = Date.now();

      // planes: extrapolate from the last data snapshot
      const flights = state.lastData.flights;
      if (flights && state.enabled.flights) {
        const dt = nowMs - state.fetchedAt.flights;
        for (const f of flights) {
          const moved = extrapolateFlight(f, Math.min(dt, 120000));
          layers.flights.moveMarker(f.icao24, moved.lat, moved.lon);
        }
      }

      // ISS glide over 2 s
      const g = state.issGlide;
      if (g && state.enabled.iss) {
        const t = Math.min(1, (performance.now() - g.start) / g.duration);
        const lat = g.fromLat + (g.toLat - g.fromLat) * t;
        let lon = g.fromLon + (g.toLon - g.fromLon) * t;
        lon = ((lon + 540) % 360) - 180;
        layers.iss.marker()?.setLatLng([lat, lon]);
        if (t >= 1) state.issGlide = null;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- layer checkboxes ----------
for (const name of ['iss', 'quakes', 'flights']) {
  const cb = document.getElementById(`layer-${name}`);
  cb.addEventListener('change', () => {
    state.enabled[name] = cb.checked;
    const layer = layerByName[name];
    if (cb.checked) {
      layer.addTo(map);
      if (name === 'iss') loadIss();
      else if (name === 'quakes') loadQuakes();
      else loadFlights();
    } else {
      map.removeLayer(layer);
      unschedule(name === 'iss' ? 'iss' : name);
    }
  });
}

// ---------- moveend: refresh flights (debounced 1 s) ----------
let moveTimer = null;
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    if (state.enabled.flights) loadFlights();
  }, 1000);
});

// ---------- dark map toggle ----------
let darkMap = true;
try {
  darkMap = localStorage.getItem('dark-map') !== 'off';
} catch { /* storage unavailable */ }

const darkTileStyle = document.createElement('style');
darkTileStyle.id = 'dark-tile-style';
document.head.appendChild(darkTileStyle);

function applyDarkMap() {
  darkTileStyle.textContent = darkMap
    ? '.leaflet-tile-pane { filter: brightness(0.75) invert(1) contrast(0.9) hue-rotate(200deg) saturate(0.4); }'
    : '';
  const btn = document.getElementById('dark-map-toggle');
  if (btn) {
    btn.classList.toggle('on', darkMap);
    btn.textContent = darkMap ? '🌙 Dark map' : '🗺 Light map';
  }
  try {
    localStorage.setItem('dark-map', darkMap ? 'on' : 'off');
  } catch { /* ignore */ }
}

applyDarkMap();

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== document.getElementById('ask-input')) {
    e.preventDefault();
    document.getElementById('ask-input').focus();
  }
});

// wire the dark map toggle button
const darkBtn = document.getElementById('dark-map-toggle');
if (darkBtn) {
  darkBtn.addEventListener('click', () => {
    darkMap = !darkMap;
    applyDarkMap();
  });
}
applyDarkMap();

// ---------- "Earth now" summary strip ----------
const earthNow = document.getElementById('earth-now');

function updateEarthNow() {
  if (!earthNow) return;
  const parts = [];
  const iss = state.lastData.iss;
  if (iss) {
    const near = nearestCity(iss.lat, iss.lon);
    const area = near.km <= 500 ? `near ${near.city.name}` : `${near.city.name} area`;
    parts.push(`🛰️ ISS over ${area}`);
  }
  const quakes = state.lastData.quakes;
  if (quakes) {
    const s = quakeStats(quakes);
    parts.push(`🌍 ${s.count} quakes today, strongest M${s.maxMag.toFixed(1)}`);
  }
  const flights = state.lastData.flights;
  if (flights) {
    parts.push(`✈ ${flights.length} planes in view`);
  }
  earthNow.textContent = parts.join(' · ');
}
setInterval(updateEarthNow, 1000);

// ---------- boot ----------
(async function boot() {
  try {
    const cfg = await getJson('/api/config');
    state.intervals = cfg.data.intervals;
    state.llmEnabled = !!cfg.data.llm;
    if (state.llmEnabled) {
      // the model name is only used for display; get it from the first AI reply otherwise
      state.llmModel = 'AI';
    }
  } catch {
    /* defaults */
  }

  if (state.enabled.iss) {
    loadIss();
    schedule('iss', state.intervals.issMs, loadIss);
    loadIssPath();
    schedule('iss-path', 10 * 60 * 1000, loadIssPath);
  }
  if (state.enabled.quakes) {
    loadQuakes();
    schedule('quakes', state.intervals.quakesMs, loadQuakes);
  }
  if (state.enabled.flights) {
    loadFlights();
    schedule('flights', state.intervals.flightsMs, loadFlights);
  }

  startAnimationLoop();
})();
