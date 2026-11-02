// Leaflet layer factories: ISS, quakes, flights. Browser-only (uses the global L).

import { splitAtAntimeridian, formatAgo } from './geo.js';
import { quakeRadiusPx, quakeColor } from './quakes.js';
import { flightLabel } from './flights.js';

const issIcon = () =>
  L.divIcon({
    className: 'iss-marker',
    html: '<div class="iss-glow">🛰️</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

function drawPolylines(layerGroup, existing, segments, options) {
  for (const line of existing) layerGroup.removeLayer(line);
  existing.length = 0;
  for (const seg of segments) {
    const line = L.polyline(seg, options).addTo(layerGroup);
    existing.push(line);
  }
}

export function createLayers(map) {
  // ----- ISS -----
  const iss = L.layerGroup().addTo(map);
  let issMarker = null;
  const issTrailLines = [];
  const issPathLines = [];

  iss.update = function (data) {
    if (!data) return;
    if (!issMarker) {
      issMarker = L.marker([data.lat, data.lon], { icon: issIcon() }).addTo(iss);
    } else {
      issMarker.setLatLng([data.lat, data.lon]);
    }
    if (typeof issMarker.setSummary === 'function') issMarker.setSummary(data);
    issMarker._pos = data;
  };
  iss.updateTrail = function (points) {
    const segs = splitAtAntimeridian(points.map((p) => [p.lat, p.lon]));
    drawPolylines(iss, issTrailLines, segs, { color: '#3ecf8e', weight: 2, opacity: 0.9 });
  };
  iss.updatePath = function (points) {
    const segs = splitAtAntimeridian(points.map((p) => [p.lat, p.lon]));
    drawPolylines(iss, issPathLines, segs, { color: '#8fd8b6', weight: 1.5, opacity: 0.7, dashArray: '6 6' });
  };
  iss.marker = () => issMarker;

  // ----- Quakes -----
  const quakes = L.layerGroup().addTo(map);
  const quakeMarkers = new Map();
  const HOUR = 3600000;

  quakes.update = function (list, now) {
    const seen = new Set();
    for (const q of list) {
      seen.add(q.id);
      let m = quakeMarkers.get(q.id);
      const fresh = now - q.time < HOUR;
      const opts = {
        radius: quakeRadiusPx(q.mag),
        color: quakeColor(q.mag),
        fillColor: quakeColor(q.mag),
        fillOpacity: 0.6,
        weight: 1,
        className: fresh ? 'quake-pulse' : ''
      };
      if (!m) {
        m = L.circleMarker([q.lat, q.lon], opts).addTo(quakes);
        quakeMarkers.set(q.id, m);
      } else {
        m.setStyle(opts);
        m.setLatLng([q.lat, q.lon]);
      }
      m._q = q;
      m.bindPopup(
        `<b>M${q.mag.toFixed(1)}</b> ${q.place}<br>` +
          `Depth: ${q.depthKm != null ? q.depthKm.toFixed(0) + ' km' : '—'} · ${formatAgo(now - q.time)}<br>` +
          `<a href="${q.url}" target="_blank" rel="noopener">USGS details</a>`
      );
    }
    for (const [id, m] of quakeMarkers) {
      if (!seen.has(id)) {
        quakes.removeLayer(m);
        quakeMarkers.delete(id);
      }
    }
  };
  quakes.markerFor = (id) => quakeMarkers.get(id);

  // ----- Flights -----
  const flights = L.layerGroup().addTo(map);
  const flightMarkers = new Map();

  function flightIcon(f) {
    const rot = (f.heading || 0) - 45; // ✈ glyph points north-east
    return L.divIcon({
      className: 'flight-marker',
      html: `<div class="plane" style="transform: rotate(${rot}deg)">✈</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  flights.update = function (list) {
    const seen = new Set();
    for (const f of list) {
      seen.add(f.icao24);
      let m = flightMarkers.get(f.icao24);
      if (!m) {
        m = L.marker([f.lat, f.lon], { icon: flightIcon(f) }).addTo(flights);
        flightMarkers.set(f.icao24, m);
      } else {
        m.setLatLng([f.lat, f.lon]);
        m.setIcon(flightIcon(f));
      }
      m._f = f;
      const altFt = f.altM != null ? Math.round(f.altM * 3.28084) : null;
      m.bindPopup(
        `<b>${flightLabel(f)}</b><br>${f.country || '—'}<br>` +
          `Alt: ${f.altM != null ? Math.round(f.altM) + ' m / ' + altFt.toLocaleString('en-US') + ' ft' : '—'}<br>` +
          `Speed: ${f.speedKmh != null ? Math.round(f.speedKmh) + ' km/h' : '—'} · ` +
          `Heading: ${f.heading != null ? Math.round(f.heading) + '°' : '—'}`
      );
    }
    for (const [id, m] of flightMarkers) {
      if (!seen.has(id)) {
        flights.removeLayer(m);
        flightMarkers.delete(id);
      }
    }
  };
  flights.markerFor = (icao) => flightMarkers.get(icao);
  flights.moveMarker = (icao, lat, lon) => {
    const m = flightMarkers.get(icao);
    if (m) m.setLatLng([lat, lon]);
  };

  return { iss, quakes, flights };
}
