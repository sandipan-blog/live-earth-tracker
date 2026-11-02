// Alert logic for the watcher agent. Pure: no DOM, no fetch, no clock.

export const SEEN_IDS_CAP = 2000;

export function newQuakeAlerts(quakes, seenIds, { minMag = 5.0 } = {}) {
  const seen = new Set(seenIds || []);
  const alerts = [];
  for (const q of quakes) {
    if (q.mag >= minMag && !seen.has(q.id)) {
      alerts.push({
        id: `quake-${q.id}`,
        kind: 'quake',
        title: `M${q.mag.toFixed(1)} earthquake`,
        detail: `${q.place}${q.tsunami ? ' · tsunami flag' : ''}`,
        lat: q.lat,
        lon: q.lon,
        time: q.time
      });
    }
  }
  // newest first for the seenIds cap: keep the NEWEST 2000 ids
  const allIds = [...quakes].sort((a, b) => b.time - a.time).map((q) => q.id);
  const merged = [];
  const inMerged = new Set();
  for (const id of [...allIds, ...(seenIds || [])]) {
    if (!inMerged.has(id)) {
      inMerged.add(id);
      merged.push(id);
    }
  }
  return { alerts, seenIds: merged.slice(0, SEEN_IDS_CAP) };
}

function passKey(cityName, startMs) {
  // rounded to 10 minutes
  const rounded = Math.round(startMs / 600000) * 600000;
  return `${cityName}:${rounded}`;
}

export function issPassAlerts(passes, city, alreadyAlerted, nowMs = 0) {
  const alerted = new Set(alreadyAlerted || []);
  const alerts = [];
  const keys = [];
  for (const p of passes) {
    const key = passKey(city.name, p.start.time);
    keys.push(key);
    if (alerted.has(key)) continue;
    const inMin = Math.max(0, Math.round((p.start.time - nowMs) / 60000));
    alerts.push({
      id: `iss-${key}`,
      kind: 'iss',
      title: `ISS pass over ${city.name}`,
      detail: `Starts in about ${inMin} min (closest ${Math.round(p.closestKm)} km)`,
      lat: city.lat,
      lon: city.lon,
      time: p.start.time
    });
  }
  return { alerts, keys: [...alerted, ...keys] };
}

export function buildDailyReport(dateStr, quakes, alerts, issPositions) {
  const bands = { under2_5: 0, from2_5to4_5: 0, from4_5to6: 0, above6: 0 };
  for (const q of quakes) {
    if (q.mag < 2.5) bands.under2_5++;
    else if (q.mag < 4.5) bands.from2_5to4_5++;
    else if (q.mag < 6) bands.from4_5to6++;
    else bands.above6++;
  }
  const sorted = [...quakes].sort((a, b) => b.mag - a.mag).slice(0, 5);

  const lines = [];
  lines.push(`# Earth report — ${dateStr}`);
  lines.push('');
  lines.push('## Earthquakes (last 24 h)');
  lines.push('');
  lines.push(`- Total: **${quakes.length}**`);
  lines.push(`- Magnitude < 2.5: ${bands.under2_5}`);
  lines.push(`- Magnitude 2.5–4.5: ${bands.from2_5to4_5}`);
  lines.push(`- Magnitude 4.5–6: ${bands.from4_5to6}`);
  lines.push(`- Magnitude ≥ 6: ${bands.above6}`);
  lines.push('');
  lines.push('### 5 strongest');
  lines.push('');
  lines.push('| Mag | Place | Depth (km) | Time (UTC) |');
  lines.push('|-----|-------|------------|------------|');
  for (const q of sorted) {
    const t = new Date(q.time).toISOString().replace('T', ' ').slice(0, 16);
    lines.push(`| M${q.mag.toFixed(1)} | ${q.place} | ${q.depthKm != null ? q.depthKm.toFixed(0) : '—'} | ${t} |`);
  }
  lines.push('');
  lines.push('## Alerts today');
  lines.push('');
  if (!alerts || alerts.length === 0) {
    lines.push('- (none)');
  } else {
    for (const a of alerts) {
      lines.push(`- **${a.title}** — ${a.detail}`);
    }
  }
  lines.push('');
  lines.push('## ISS');
  lines.push('');
  lines.push(`- Positions sampled: ${issPositions ? issPositions.length : 0}`);
  lines.push('');
  return lines.join('\n');
}

// Decides whether the first run should mark everything as seen without alerting.
export function isFirstRun(state) {
  return !state || state.lastRun == null;
}
