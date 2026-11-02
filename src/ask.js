// "Ask the map" built-in answerer. Pure logic: no DOM, no L, no fetch, no clock.

import { findCity } from './cities.js';
import { issSummary, findPasses } from './iss.js';
import { filterQuakes, sortByMag, quakesNear } from './quakes.js';
import { formatAgo, haversineKm, inBounds } from './geo.js';

const has = (q, ...words) => words.some((w) => q.includes(w));

export function answerLocal(question, snapshot) {
  const q = String(question || '').toLowerCase().trim();
  const s = snapshot || {};
  const now = s.now || 0;

  // --- ISS position ---
  if (s.iss && has(q, 'where is the iss', 'where is the space station', 'iss position', 'position of the iss')) {
    return {
      answer: issSummary(s.iss),
      action: { type: 'flyTo', lat: s.iss.lat, lon: s.iss.lon, zoom: 4 }
    };
  }

  // --- ISS pass over a city ---
  if (has(q, 'pass over', 'pass near', 'when will the iss', 'iss pass')) {
    const city = findCity(q) || s.selectedCity;
    if (city && s.issPath && s.issPath.length > 0) {
      const passes = findPasses(s.issPath, city, 1000);
      if (passes.length === 0) {
        return {
          answer: `No ISS pass near ${city.name} in the next 90 minutes.`,
          action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 5 }
        };
      }
      const p = passes[0];
      const inMin = Math.max(0, Math.round((p.start.time - now) / 60000));
      return {
        answer:
          `The ISS passes near ${city.name} in ${inMin} min ` +
          `(closest ${Math.round(p.closestKm)} km, at ${new Date(p.closestTime).toISOString().slice(11, 16)} UTC).`,
        action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 5 }
      };
    }
    return {
      answer: 'I do not have the ISS predicted path yet. Ask again in a moment.',
      action: null
    };
  }

  // --- biggest earthquake ---
  if (has(q, 'biggest earthquake', 'strongest earthquake', 'largest earthquake', 'biggest quake', 'strongest quake')) {
    const list = s.quakes || [];
    if (list.length === 0) return { answer: 'No earthquake data right now.', action: null };
    const strong = sortByMag(list)[0];
    return {
      answer:
        `The strongest earthquake in the last 24 h was M${strong.mag.toFixed(1)}, ` +
        `${strong.place}, ${formatAgo(now - strong.time)}.`,
      action: { type: 'flyTo', lat: strong.lat, lon: strong.lon, zoom: 6 }
    };
  }

  // --- how many earthquakes ---
  if (has(q, 'how many earthquake', 'how many quake', 'number of earthquake', 'earthquake count')) {
    const list = s.quakes || [];
    const m = q.match(/above\s+(\d+(\.\d+)?)|over\s+(\d+(\.\d+)?)/);
    const threshold = m ? parseFloat(m[1] || m[3]) : 0;
    const filtered = threshold > 0 ? filterQuakes(list, { minMag: threshold }) : list;
    return {
      answer:
        threshold > 0
          ? `There were ${filtered.length} earthquakes of magnitude ${threshold} or above in the last 24 h.`
          : `There were ${list.length} earthquakes in the last 24 h.`,
      action: null
    };
  }

  // --- earthquakes near a city ---
  if (has(q, 'earthquake near', 'quake near', 'earthquakes near', 'quakes near')) {
    const city = findCity(q) || s.selectedCity;
    const list = s.quakes || [];
    if (!city) return { answer: 'Which city do you mean?', action: null };
    const near = quakesNear(list, city.lat, city.lon, 1000);
    if (near.length === 0) {
      return {
        answer: `No earthquakes within 1000 km of ${city.name} in the last 24 h.`,
        action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 5 }
      };
    }
    const first = near[0];
    return {
      answer:
        `${near.length} earthquakes within 1000 km of ${city.name}. The nearest: ` +
        `M${first.mag.toFixed(1)} ${first.place}, ${Math.round(first.distanceKm)} km away.`,
      action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 5 }
    };
  }

  // --- flights over a city ---
  if (has(q, 'flight', 'plane', 'aircraft')) {
    const city = findCity(q) || s.selectedCity;
    if (!city) {
      return { answer: 'Which area do you mean? Try "flights over Delhi".', action: null };
    }
    const b = s.flightsBounds;
    if (!b || !inBounds(city.lat, city.lon, b)) {
      return {
        answer: `Move the map to ${city.name} first, I only have flights for the current view.`,
        action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 7 }
      };
    }
    const list = (s.flights || []).filter(
      (f) => haversineKm(city.lat, city.lon, f.lat, f.lon) <= 150
    );
    if (list.length === 0) {
      return {
        answer: `No flights within 150 km of ${city.name} right now.`,
        action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 7 }
      };
    }
    const names = list.slice(0, 3).map((f) => f.callsign || f.icao24.toUpperCase()).join(', ');
    return {
      answer: `${list.length} flights within 150 km of ${city.name}, including ${names}.`,
      action: { type: 'flyTo', lat: city.lat, lon: city.lon, zoom: 7 }
    };
  }

  // --- help ---
  return {
    answer:
      'Try asking: "Where is the ISS?" · "When will the ISS pass over Delhi?" · ' +
      '"Biggest earthquake today?" · "How many earthquakes above 4?" · ' +
      '"Earthquakes near Tokyo?" · "Flights over London?"',
    action: null
  };
}

// ---------- LLM helpers ----------

export function buildSnapshotForLlm(snapshot) {
  const s = snapshot || {};
  const now = s.now || 0;
  const out = {};

  if (s.iss) {
    out.iss = {
      position: { lat: round2(s.iss.lat), lon: round2(s.iss.lon) },
      altitudeKm: Math.round(s.iss.altKm),
      speedKmh: Math.round(s.iss.speedKmh),
      summary: issSummary(s.iss)
    };
  }

  if (s.selectedCity && Array.isArray(s.issPath) && s.issPath.length > 0) {
    const passes = findPasses(s.issPath, s.selectedCity, 1000);
    out.nextIssPassForSelectedCity =
      passes.length === 0
        ? `none within 90 minutes of ${s.selectedCity.name}`
        : `in ${Math.max(0, Math.round((passes[0].start.time - now) / 60000))} min, closest ${Math.round(passes[0].closestKm)} km`;
  }

  if (Array.isArray(s.quakes)) {
    out.strongestQuakes = sortByMag(s.quakes)
      .slice(0, 15)
      .map((q) => ({
        id: q.id,
        mag: q.mag,
        place: q.place,
        lat: round2(q.lat),
        lon: round2(q.lon),
        agoMin: Math.round((now - q.time) / 60000)
      }));
  }

  if (Array.isArray(s.flights)) {
    const airborne = s.flights.filter((f) => !f.onGround).length;
    const countries = {};
    for (const f of s.flights) {
      if (f.country) countries[f.country] = (countries[f.country] || 0) + 1;
    }
    out.flightsInView = {
      count: s.flights.length,
      airborne,
      topCountries: Object.entries(countries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
      sample: s.flights.slice(0, 15).map((f) => ({
        callsign: f.callsign || (f.icao24 || '').toUpperCase(),
        country: f.country,
        lat: round2(f.lat),
        lon: round2(f.lon),
        altM: f.altM == null ? null : Math.round(f.altM),
        speedKmh: f.speedKmh == null ? null : Math.round(f.speedKmh)
      }))
    };
  }

  if (s.flightsBounds) {
    out.mapBounds = {
      south: round2(s.flightsBounds.south),
      west: round2(s.flightsBounds.west),
      north: round2(s.flightsBounds.north),
      east: round2(s.flightsBounds.east)
    };
  } else if (s.bounds) {
    out.mapBounds = {
      south: round2(s.bounds.south),
      west: round2(s.bounds.west),
      north: round2(s.bounds.north),
      east: round2(s.bounds.east)
    };
  }

  out.currentTimeUtc = new Date(now).toISOString();
  return out;
}

function round2(n) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : null;
}

export function buildMessages(question, compactSnapshot) {
  return [
    {
      role: 'system',
      content:
        'You are the assistant of the Live Earth Tracker map app. ' +
        'Answer ONLY from the live data given in the user message. ' +
        'If the data does not contain the answer, say so plainly. ' +
        'Reply with ONLY a JSON object, no other text, in exactly this shape: ' +
        '{"answer": string, "action": null | {"type":"flyTo","lat":number,"lon":number,"zoom":number} | ' +
        '{"type":"highlight","layer":"quakes"|"flights"|"iss","ids":[string]}}. ' +
        'Use flyTo when your answer points at a place on the map (zoom 2-12). ' +
        'Use highlight only when the answer refers to specific quake/flight/ISS objects you have ids for. ' +
        'Otherwise use null.'
    },
    {
      role: 'user',
      content: `Live data (JSON):\n${JSON.stringify(compactSnapshot)}\n\nQuestion: ${question}`
    }
  ];
}

const LAYERS = new Set(['quakes', 'flights', 'iss']);

export function parseLlmReply(text) {
  const raw = String(text == null ? '' : text).trim();
  // find the first {...} block
  let obj = null;
  const start = raw.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(start, i + 1);
          try {
            obj = JSON.parse(candidate);
          } catch {
            obj = null;
          }
          break;
        }
      }
    }
  }

  if (!obj || typeof obj.answer !== 'string') {
    return { answer: raw || '(empty reply)', action: null };
  }

  let action = null;
  const a = obj.action;
  if (a && typeof a === 'object') {
    if (a.type === 'flyTo' &&
        typeof a.lat === 'number' && a.lat >= -90 && a.lat <= 90 &&
        typeof a.lon === 'number' && a.lon >= -180 && a.lon <= 180 &&
        typeof a.zoom === 'number' && a.zoom >= 2 && a.zoom <= 12) {
      action = { type: 'flyTo', lat: a.lat, lon: a.lon, zoom: a.zoom };
    } else if (a.type === 'highlight' &&
               LAYERS.has(a.layer) &&
               Array.isArray(a.ids) && a.ids.length > 0 &&
               a.ids.every((id) => typeof id === 'string')) {
      action = { type: 'highlight', layer: a.layer, ids: a.ids };
    }
  }

  return { answer: obj.answer.trim(), action };
}
