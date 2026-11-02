import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createCache, cached } from './src/cache.js';
import { fetchIss, fetchIssPath, fetchQuakes, fetchFlights } from './src/sources.js';
import { parseFlights } from './src/flights.js';
import { buildSnapshotForLlm, buildMessages, parseLlmReply } from './src/ask.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// ---------- config ----------

export function loadConfig({ env = process.env, secretsPath } = {}) {
  const p = secretsPath || env.SECRETS_FILE || path.join(os.homedir(), '.secrets', 'live-earth.json');
  let fileCfg = {};
  try {
    if (fs.existsSync(p)) fileCfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    console.log('Config: could not read the secrets file; using defaults.');
  }
  return {
    llmApiKey: env.LLM_API_KEY || env.SOKET_API_KEY || fileCfg.llmApiKey || '',
    llmBaseUrl: env.LLM_BASE_URL || fileCfg.llmBaseUrl || 'https://api.soket.ai/v1',
    llmModel: env.LLM_MODEL || fileCfg.llmModel || '',
    llmFallbackModel: env.LLM_FALLBACK_MODEL || fileCfg.llmFallbackModel || '',
    llmMaxTokens: Number(env.LLM_MAX_TOKENS || fileCfg.llmMaxTokens || 8000),
    openskyClientId: env.OPENSKY_CLIENT_ID || fileCfg.openskyClientId || '',
    openskyClientSecret: env.OPENSKY_CLIENT_SECRET || fileCfg.openskyClientSecret || ''
  };
}

// ---------- helpers ----------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function roundBounds(q) {
  const num = (name, def = 0) => {
    const v = parseFloat(q.get(name));
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : def;
  };
  return { south: num('south'), west: num('west'), north: num('north'), east: num('east') };
}

// ---------- app ----------

export function createApp(options = {}) {
  const root = options.root || __dirname;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const config = options.config || {};

  const cache = createCache();
  const state = {
    flightsBackoffUntil: 0,
    tokenBackoffUntil: 0,
    tokenFetchPromise: null
  };

  // ---- OpenSky OAuth token (cached until 60 s before expiry) ----
  async function getOpenskyToken() {
    if (!config.openskyClientId || !config.openskyClientSecret) return null;
    const hit = cache.get('opensky-token', now());
    if (hit) return hit;
    if (now() < state.tokenBackoffUntil) return null;
    if (!state.tokenFetchPromise) {
      state.tokenFetchPromise = (async () => {
        try {
          const res = await fetchImpl(
            'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body:
                `grant_type=client_credentials&client_id=${encodeURIComponent(config.openskyClientId)}` +
                `&client_secret=${encodeURIComponent(config.openskyClientSecret)}`,
              signal: AbortSignal.timeout(15000)
            }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const ttl = Math.max(0, ((json.expires_in || 300) - 60) * 1000);
          cache.set('opensky-token', json.access_token, ttl, now());
          return json.access_token;
        } catch (err) {
          console.log('OpenSky login failed, falling back to anonymous. (' + err.message + ')');
          state.tokenBackoffUntil = now() + 60000;
          return null;
        } finally {
          state.tokenFetchPromise = null;
        }
      })();
    }
    return state.tokenFetchPromise;
  }

  async function handleApi(req, res, url) {
    const p = url.pathname;

    if (req.method === 'GET' && p === '/api/iss') {
      try {
        const data = await cached(cache, 'iss', 2000, now(), () => fetchIss(fetchImpl));
        return sendJson(res, 200, { ok: true, data, stale: !!data.stale, fetchedAt: now() });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: 'ISS temporarily unavailable' });
      }
    }

    if (req.method === 'GET' && p === '/api/iss/path') {
      try {
        const data = await cached(cache, 'iss-path', 10 * 60 * 1000, now(), () =>
          fetchIssPath(fetchImpl, now())
        );
        return sendJson(res, 200, { ok: true, data, stale: !!data.stale, fetchedAt: now() });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: 'ISS path temporarily unavailable' });
      }
    }

    if (req.method === 'GET' && p === '/api/quakes') {
      try {
        const data = await cached(cache, 'quakes', 60000, now(), () => fetchQuakes(fetchImpl));
        return sendJson(res, 200, { ok: true, data, stale: !!data.stale, fetchedAt: now() });
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: 'Earthquake data temporarily unavailable' });
      }
    }

    if (req.method === 'GET' && p === '/api/flights') {
      const b = roundBounds(url.searchParams);
      const key = `flights:${b.south},${b.west},${b.north},${b.east}`;
      const hasAuth = !!(config.openskyClientId && config.openskyClientSecret);
      const ttl = hasAuth ? 15000 : 50000;
      if (now() < state.flightsBackoffUntil) {
        const old = cache.get('__stale__' + key, Number.MAX_SAFE_INTEGER);
        if (old) return sendJson(res, 200, { ok: true, data: old, stale: true, fetchedAt: now() });
        return sendJson(res, 502, { ok: false, error: 'Flights temporarily unavailable (rate limited)' });
      }
      try {
        const data = await cached(cache, key, ttl, now(), async () => {
          const token = await getOpenskyToken();
          const raw = await fetchFlights(fetchImpl, b, token || undefined);
          return parseFlights(raw);
        });
        return sendJson(res, 200, { ok: true, data, stale: !!data.stale, fetchedAt: now() });
      } catch (err) {
        if (err && (err.status === 429 || err.status === undefined)) {
          state.flightsBackoffUntil = now() + 60000;
        }
        if (err && err.status === 429) {
          const old = cache.get('__stale__' + key, Number.MAX_SAFE_INTEGER);
          if (old) return sendJson(res, 200, { ok: true, data: old, stale: true, fetchedAt: now() });
          return sendJson(res, 502, { ok: false, error: 'Flights temporarily unavailable (rate limited)' });
        }
        return sendJson(res, 502, { ok: false, error: 'Flights temporarily unavailable' });
      }
    }

    if (req.method === 'GET' && p === '/api/config') {
      const hasAuth = !!(config.openskyClientId && config.openskyClientSecret);
      return sendJson(res, 200, {
        ok: true,
        data: {
          llm: !!config.llmApiKey && !!config.llmModel,
          openskyAuth: hasAuth,
          intervals: { issMs: 2000, flightsMs: hasAuth ? 20000 : 60000, quakesMs: 60000 }
        }
      });
    }

    if (req.method === 'GET' && p === '/api/alerts') {
      let alerts = [];
      try {
        alerts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'alerts.json'), 'utf8'));
        if (!Array.isArray(alerts)) alerts = [];
      } catch {
        alerts = [];
      }
      return sendJson(res, 200, { ok: true, data: alerts, fetchedAt: now() });
    }

    // ---- Ask the map (LLM) ----
    if (req.method === 'POST' && p === '/api/ask') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 100 * 1024) req.destroy();
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const question = String(parsed.question || '').slice(0, 2000);
          const fast = !!parsed.fast;
          const compact = buildSnapshotForLlm(parsed.snapshot || {});
          const messages = buildMessages(question, compact);

          if (!config.llmApiKey || !config.llmModel) {
            return sendJson(res, 200, { ok: true, mode: 'local' });
          }

          async function callModel(model, timeoutMs) {
            const r = await fetchImpl(`${config.llmBaseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.llmApiKey}`
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.2,
                max_tokens: Math.max(6000, config.llmMaxTokens || 8000)
              }),
              signal: AbortSignal.timeout(timeoutMs)
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = await r.json();
            const content = json.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || content.trim() === '') {
              throw new Error('empty content');
            }
            return parseLlmReply(content);
          }

          let reply = null;
          let usedModel = null;
          if (!fast) {
            try {
              reply = await callModel(config.llmModel, 90000);
              usedModel = config.llmModel;
            } catch {
              reply = null;
            }
          }
          if (!reply && config.llmFallbackModel) {
            try {
              reply = await callModel(config.llmFallbackModel, 20000);
              usedModel = config.llmFallbackModel;
            } catch {
              reply = null;
            }
          }
          if (!reply) {
            return sendJson(res, 200, {
              ok: true, mode: 'local', note: 'AI unavailable, used built-in answers'
            });
          }
          return sendJson(res, 200, { ok: true, mode: 'llm', model: usedModel, ...reply });
        } catch {
          return sendJson(res, 400, { ok: false, error: 'Bad request' });
        }
      });
      return;
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  }

  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Server error' });
      });
      return;
    }
    try {
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const resolved = path.resolve(root, '.' + pathname);
      if (!resolved.startsWith(root + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }
      let stat;
      try { stat = fs.statSync(resolved); } catch { stat = null; }
      if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      const type = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(resolved).pipe(res);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error');
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const port = process.env.PORT || 8085;
  http.createServer(createApp({ config })).listen(port, () => {
    const ai = config.llmApiKey
      ? `on (${config.llmModel}${config.llmFallbackModel ? ', backup ' + config.llmFallbackModel : ''})`
      : 'off';
    const sky = config.openskyClientId ? 'on' : 'off';
    console.log(`Live Earth Tracker at http://localhost:${port} — AI answers: ${ai} · OpenSky login: ${sky}`);
  });
}
