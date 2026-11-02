// Panel UI: stats, info card, city search, geolocation, legend, status dot. Browser-only.

import { formatLatLon, formatAgo } from './geo.js';
import { findCity, nearestCity } from './cities.js';
import { quakeStats, quakeColor } from './quakes.js';
import { flightStats, flightLabel } from './flights.js';
import { issSummary, findPasses } from './iss.js';

const el = (id) => document.getElementById(id);

export function createUi(map, layers, state) {
  // ---------- stats ----------
  function renderIssStats() {
    const pos = state.lastData.iss;
    if (!pos) return;
    const near = nearestCity(pos.lat, pos.lon);
    const ago = formatAgo(Date.now() - state.fetchedAt.iss);
    el('stat-iss').innerHTML =
      `<div class="stat-title">ISS ${liveBadge(state, 'iss')}</div>` +
      `<div>${formatLatLon(pos.lat, pos.lon)}</div>` +
      `<div>Alt ${Math.round(pos.altKm)} km · ${Math.round(pos.speedKmh).toLocaleString('en-US')} km/h</div>` +
      `<div class="muted">updated ${ago}</div>` +
      `<button id="follow-iss" class="chip ${state.followIss ? 'on' : ''}">Follow ISS</button>`;
    el('follow-iss').addEventListener('click', () => {
      state.followIss = !state.followIss;
      renderIssStats();
      if (state.followIss && state.lastData.iss) {
        map.panTo([state.lastData.iss.lat, state.lastData.iss.lon]);
      }
    });
  }

  function renderQuakeStats() {
    const list = state.lastData.quakes;
    if (!list) return;
    const s = quakeStats(list);
    const strong = s.strongest;
    el('stat-quakes').innerHTML =
      `<div class="stat-title">Earthquakes ${liveBadge(state, 'quakes')}</div>` +
      `<div>${s.count} in 24 h · ${s.countAbove[4.5]} ≥ M4.5</div>` +
      (strong
        ? `<div>Strongest: <span style="color:${quakeColor(strong.mag)}">M${strong.mag.toFixed(1)}</span> ${strong.place}</div>`
        : '');
  }

  function renderFlightStats() {
    const list = state.lastData.flights;
    if (!list) return;
    const s = flightStats(list);
    const top3 = s.topCountries.slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ');
    el('stat-flights').innerHTML =
      `<div class="stat-title">Flights ${liveBadge(state, 'flights')}</div>` +
      `<div>${s.count} in view · ${s.airborne} airborne</div>` +
      (top3 ? `<div class="muted">${top3}</div>` : '');
  }

  function liveBadge(state, name) {
    const interval = name === 'iss' ? state.intervals.issMs
      : name === 'flights' ? state.intervals.flightsMs
      : state.intervals.quakesMs;
    const age = Date.now() - state.fetchedAt[name];
    return age < interval * 2
      ? '<span class="live">● LIVE</span>'
      : '<span class="stale-badge">○ stale</span>';
  }

  // ---------- info card ----------
  function showInfo(html) {
    el('info-body').innerHTML = html;
    el('info-card').classList.remove('hidden');
  }
  el('info-close').addEventListener('click', () => el('info-card').classList.add('hidden'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el('info-card').classList.add('hidden');
  });

  function bindInfoCards() {
    // quakes
    layers.quakes.eachLayer((m) => {
      if (m._q && !m._boundInfo) {
        m._boundInfo = true;
        m.on('click', () => {
          const q = m._q;
          showInfo(
            `<h3><span style="color:${quakeColor(q.mag)}">M${q.mag.toFixed(1)}</span> earthquake</h3>` +
            `<p>${q.place}</p>` +
            `<p>Depth: ${q.depthKm != null ? q.depthKm.toFixed(0) + ' km' : '—'} · ${formatAgo(Date.now() - q.time)}</p>` +
            (q.tsunami ? '<p class="warn">⚠ Tsunami flag</p>' : '') +
            `<p><a href="${q.url}" target="_blank" rel="noopener">USGS details</a></p>`
          );
        });
      }
    });
    // flights
    layers.flights.eachLayer((m) => {
      if (m._f && !m._boundInfo) {
        m._boundInfo = true;
        m.on('click', () => {
          const f = m._f;
          const altFt = f.altM != null ? Math.round(f.altM * 3.28084).toLocaleString('en-US') : '—';
          showInfo(
            `<h3>✈ ${flightLabel(f)}</h3>` +
            `<p>${f.country || '—'}</p>` +
            `<p>Altitude: ${f.altM != null ? Math.round(f.altM) + ' m / ' + altFt + ' ft' : '—'}</p>` +
            `<p>Speed: ${f.speedKmh != null ? Math.round(f.speedKmh) + ' km/h' : '—'}</p>` +
            `<p>Heading: ${f.heading != null ? Math.round(f.heading) + '°' : '—'}</p>`
          );
        });
      }
    });
    // iss
    const issMarker = layers.iss.marker();
    if (issMarker && !issMarker._boundInfo) {
      issMarker._boundInfo = true;
      issMarker.on('click', () => {
        const pos = state.lastData.iss;
        if (pos) showInfo(`<h3>🛰 ISS</h3><p>${issSummary(pos, nearestCity(pos.lat, pos.lon))}</p>`);
      });
    }
  }

  // ---------- selected city ----------
  let cityCircle = null;
  let cityMarker = null;

  function selectCity(city, label) {
    state.selectedCity = city;
    if (cityCircle) map.removeLayer(cityCircle);
    if (cityMarker) map.removeLayer(cityMarker);
    cityCircle = L.circle([city.lat, city.lon], {
      radius: 1000000, // 1000 km
      color: '#5aa9ff', weight: 1, fillOpacity: 0.04
    }).addTo(map);
    cityMarker = L.circleMarker([city.lat, city.lon], {
      radius: 5, color: '#5aa9ff', fillOpacity: 1
    }).addTo(map);
    map.flyTo([city.lat, city.lon], 6);
    renderPassInfo(city, label || city.name);
  }

  function renderPassInfo(city, label) {
    const box = el('pass-info');
    if (!box) return;
    const path = state.lastData.issPath;
    if (!path || path.length === 0) {
      box.innerHTML = `<div class="muted">No ISS path data yet.</div>`;
      return;
    }
    const passes = findPasses(path, city, 1000);
    if (passes.length === 0) {
      box.innerHTML = `<div>No ISS pass near ${label} in the next 90 minutes.</div>`;
    } else {
      const p = passes[0];
      const inMin = Math.max(0, Math.round((p.start.time - Date.now()) / 60000));
      box.innerHTML =
        `<div>Next ISS pass near ${label}: in ${inMin} min ` +
        `(closest ${Math.round(p.closestKm)} km)</div>`;
    }
  }

  // ---------- city search ----------
  el('city-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = e.target.value.trim();
    if (!text) return;
    const city = findCity(text);
    if (city) {
      selectCity(city);
      e.target.value = '';
    } else {
      e.target.value = '';
      e.target.placeholder = 'City not found — try "Delhi"';
    }
  });

  // ---------- my location ----------
  el('my-location').addEventListener('click', () => {
    if (!navigator.geolocation) {
      flashMessage('Geolocation not supported here');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const city = {
          name: 'My location', country: '',
          lat: pos.coords.latitude, lon: pos.coords.longitude
        };
        selectCity(city, 'my location');
      },
      () => flashMessage('Could not get your location'),
      { timeout: 10000 }
    );
  });

  function flashMessage(msg) {
    const box = el('pass-info');
    if (box) box.innerHTML = `<div class="muted">${msg}</div>`;
  }

  // ---------- ask badge ----------
  function renderAskBadge() {
    const box = el('ask-badge');
    if (!box) return;
    if (state.llmEnabled) {
      box.textContent = 'AI';
      box.title = `AI answers by ${state.llmModel}`;
    } else {
      box.textContent = 'Built-in';
      box.title = 'Built-in answers only';
    }
  }
  renderAskBadge();

  // ---------- ask the map ----------
  const EXAMPLES = [
    'Where is the ISS?',
    'Biggest earthquake today?',
    'Earthquakes near Delhi?',
    'Flights over Mumbai?'
  ];

  function appendBubble(text, who) {
    const log = el('ask-log');
    const div = document.createElement('div');
    div.className = `bubble ${who}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  const chipsBox = el('ask-chips');
  for (const ex of EXAMPLES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip example-chip';
    chip.textContent = ex;
    chip.addEventListener('click', () => {
      el('ask-input').value = ex;
      el('ask-form').requestSubmit();
    });
    chipsBox.appendChild(chip);
  }

  el('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('ask-input');
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    appendBubble(question, 'user');

    const snapshot = {
      iss: state.lastData.iss,
      issPath: state.lastData.issPath,
      quakes: state.lastData.quakes,
      flights: state.lastData.flights,
      flightsBounds: state.flightsBounds,
      selectedCity: state.selectedCity,
      now: Date.now()
    };
    const { answerLocal } = await import('./ask.js');

    // Built-in intents answer instantly; everything else goes to the LLM.
    const local = answerLocal(question, snapshot);
    const isHelp = /help|what can you|examples?/.test(question.toLowerCase());
    const builtinHit =
      local.action !== null || (local.answer && !local.answer.includes('Try asking')) || isHelp;

    function runAction(r) {
      if (r && r.action && r.action.type === 'flyTo') {
        map.flyTo([r.action.lat, r.action.lon], r.action.zoom);
      }
    }

    if (builtinHit || !state.llmEnabled) {
      appendBubble(local.answer, 'bot');
      runAction(local);
      return;
    }

    // --- LLM path ---
    const log = el('ask-log');
    const typing = document.createElement('div');
    typing.className = 'bubble bot typing';
    const quick = document.createElement('a');
    quick.href = '#';
    quick.className = 'quick-link';
    quick.textContent = 'Quick answer';
    typing.append(document.createTextNode(state.llmModel + ' is thinking… '), quick);
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    const start = Date.now();
    const tick = setInterval(() => {
      typing.childNodes[0].textContent =
        `${state.llmModel} is thinking… ${Math.round((Date.now() - start) / 1000)} s `;
      log.scrollTop = log.scrollHeight;
    }, 1000);

    const controller = new AbortController();
    let aborted = false;
    quick.addEventListener('click', async (ev) => {
      ev.preventDefault();
      aborted = true;
      controller.abort();
    });

    async function askServer(fast) {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, snapshot, fast }),
        signal: controller.signal
      });
      return res.json();
    }

    try {
      let j = await askServer(false);
      if (j.mode === 'local' && j.note && !aborted) {
        // AI unavailable → built-in fallback
        typing.remove();
        clearInterval(tick);
        appendBubble(local.answer + ' (built-in)', 'bot');
        runAction(local);
        return;
      }
      clearInterval(tick);
      typing.remove();
      const div = document.createElement('div');
      div.className = 'bubble bot';
      div.textContent = j.answer;
      const tag = document.createElement('div');
      tag.className = 'model-tag';
      tag.textContent = j.model || '';
      div.appendChild(tag);
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      runAction(j);
    } catch {
      if (aborted) {
        // re-ask with fast:true (backup model directly)
        try {
          const j = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, snapshot, fast: true })
          }).then((r) => r.json());
          clearInterval(tick);
          typing.remove();
          const div = document.createElement('div');
          div.className = 'bubble bot';
          div.textContent = j.answer || local.answer;
          const tag = document.createElement('div');
          tag.className = 'model-tag';
          tag.textContent = j.model || 'built-in';
          div.appendChild(tag);
          log.appendChild(div);
          log.scrollTop = log.scrollHeight;
          runAction(j.answer ? j : local);
        } catch {
          clearInterval(tick);
          typing.remove();
          appendBubble(local.answer + ' (built-in)', 'bot');
          runAction(local);
        }
      } else {
        clearInterval(tick);
        typing.remove();
        appendBubble(local.answer + ' (built-in)', 'bot');
        runAction(local);
      }
    }
  });

  // "/" focuses the ask box
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== el('ask-input')) {
      e.preventDefault();
      el('ask-input').focus();
    }
  });

  // ---------- legend ----------
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML =
      '<b>Magnitude</b><br>' +
      `<i style="background:#3ecf8e"></i> &lt; 2.5<br>` +
      `<i style="background:#f5c542"></i> 2.5 – 4.5<br>` +
      `<i style="background:#ff8c42"></i> 4.5 – 6<br>` +
      `<i style="background:#ff4d4f"></i> ≥ 6<br>` +
      `<span class="legend-iss">🛰️</span> ISS &nbsp; <span class="legend-plane">✈</span> Flight`;
    return div;
  };
  legend.addTo(map);

  // ---------- alerts ----------
  let lastAlertCount = 0;
  let unread = 0;

  async function loadAlerts() {
    try {
      const j = await (await fetch('/api/alerts')).json();
      if (!j.ok) return;
      const list = el('alert-list');
      list.innerHTML = '';
      for (const a of j.data.slice(0, 30)) {
        const li = document.createElement('li');
        li.className = `alert-item ${a.kind}`;
        li.textContent = `${a.title} — ${a.detail}`;
        li.addEventListener('click', () => map.flyTo([a.lat, a.lon], 5));
        list.appendChild(li);
      }
      if (j.data.length > lastAlertCount && lastAlertCount > 0) {
        unread += j.data.length - lastAlertCount;
      } else if (lastAlertCount === 0) {
        unread = 0;
      }
      lastAlertCount = j.data.length;
      renderAlertBadge();
    } catch {
      /* alerts are optional */
    }
  }

  function renderAlertBadge() {
    let badge = el('alert-badge');
    if (!badge) {
      const h = document.querySelector('#alerts h2');
      badge = document.createElement('span');
      badge.id = 'alert-badge';
      badge.className = 'ask-badge';
      h.appendChild(badge);
    }
    badge.textContent = unread > 0 ? String(unread) : '';
  }

  loadAlerts();
  setInterval(loadAlerts, 60000);

  // ---------- status dot ----------

  function updateStatusDot() {
    const names = ['iss', 'quakes', 'flights'].filter((n) => state.enabled[n]);
    if (names.length === 0) {
      el('status-dot').style.background = '#888';
      return;
    }
    let failing = 0;
    let staleOrFailing = 0;
    for (const n of names) {
      const interval = n === 'iss' ? state.intervals.issMs
        : n === 'flights' ? state.intervals.flightsMs
        : state.intervals.quakesMs;
      const age = Date.now() - state.fetchedAt[n];
      if (state.errors[n]) { failing++; staleOrFailing++; }
      else if (age > interval * 2) staleOrFailing++;
    }
    const dot = el('status-dot');
    if (failing === names.length) dot.style.background = '#ff4d4f';
    else if (staleOrFailing > 0) dot.style.background = '#f5c542';
    else dot.style.background = '#3ecf8e';
  }

  // ---------- refresh hook ----------
  function refresh() {
    if (state.lastData.iss) renderIssStats();
    if (state.lastData.quakes) renderQuakeStats();
    if (state.lastData.flights) renderFlightStats();
    bindInfoCards();
    updateStatusDot();
    if (state.selectedCity) renderPassInfo(state.selectedCity, state.selectedCity.name);
    if (typeof state.onUpdate === 'function') state.onUpdate();
  }

  return { refresh, selectCity, showInfo };
}
