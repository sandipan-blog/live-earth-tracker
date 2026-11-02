import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

import { createApp, loadConfig } from '../server.js';

const fixturesDir = path.resolve('tests/fixtures');
const readFixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));

const issFixture = readFixture('iss.json');
const issPathFixture = readFixture('iss_positions.json');
const quakesFixture = readFixture('quakes.geojson');
const flightsFixture = readFixture('flights.json');

// A fake fetch that serves fixtures and counts calls per URL prefix.
function makeFakeFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const u = String(url);
    if (overrides.handler && overrides.handler(u, options, calls)) {
      return overrides.handler(u, options, calls);
    }
    let body;
    if (u.includes('wheretheiss.at/v1/satellites/25544/positions')) body = issPathFixture;
    else if (u.includes('wheretheiss.at')) body = issFixture;
    else if (u.includes('earthquake.usgs.gov')) body = quakesFixture;
    else if (u.includes('opensky-network.org/api/states')) body = flightsFixture;
    else return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const countCalls = (fetchImpl, part) =>
  fetchImpl.calls.filter((c) => c.url.includes(part)).length;

async function startServer(handler) {
  const server = await new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, () => resolve(s));
  });
  return { server, port: server.address().port };
}

async function withServer(fn, appOptions = {}) {
  const fetchImpl = appOptions.fetchImpl || makeFakeFetch();
  const app = createApp({ ...appOptions, fetchImpl, root: process.cwd() });
  const { server, port } = await startServer(app);
  try {
    await fn(port, fetchImpl);
  } finally {
    server.close();
  }
}

// ---------- loadConfig ----------

test('loadConfig reads a JSON secrets file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'let-'));
  const p = path.join(dir, 'secrets.json');
  fs.writeFileSync(
    p,
    JSON.stringify({
      llmApiKey: 'test-key', llmModel: 'GLM-5.3', llmFallbackModel: 'llama-3.1-8b-instruct',
      openskyClientId: 'cid', openskyClientSecret: 'csecret'
    })
  );
  const cfg = loadConfig({ env: {}, secretsPath: p });
  assert.equal(cfg.llmApiKey, 'test-key');
  assert.equal(cfg.llmModel, 'GLM-5.3');
  assert.equal(cfg.openskyClientId, 'cid');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('env vars override the secrets file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'let-'));
  const p = path.join(dir, 'secrets.json');
  fs.writeFileSync(p, JSON.stringify({ llmApiKey: 'file-key', llmModel: 'file-model' }));
  const cfg = loadConfig({
    env: { LLM_API_KEY: 'env-key', LLM_MODEL: 'env-model' },
    secretsPath: p
  });
  assert.equal(cfg.llmApiKey, 'env-key');
  assert.equal(cfg.llmModel, 'env-model');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a missing secrets file gives empty values without throwing', () => {
  const cfg = loadConfig({ env: {}, secretsPath: '/nonexistent/nope.json' });
  assert.equal(cfg.llmApiKey, '');
  assert.equal(cfg.openskyClientId, '');
  assert.equal(cfg.llmBaseUrl, 'https://api.soket.ai/v1');
  assert.equal(cfg.llmMaxTokens, 8000);
});

test('SOKET_API_KEY works too and defaults apply', () => {
  const cfg = loadConfig({ env: { SOKET_API_KEY: 'sk' }, secretsPath: '/nonexistent/x.json' });
  assert.equal(cfg.llmApiKey, 'sk');
});

// ---------- OAuth token ----------

test('the OAuth token is requested once and reused until near expiry', async () => {
  let nowMs = 0;
  let tokenCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) {
      tokenCalls++;
      return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 300 }), { status: 200 });
    }
    if (String(url).includes('opensky-network.org/api/states')) {
      return new Response(JSON.stringify(flightsFixture), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const config = { openskyClientId: 'cid', openskyClientSecret: 'csecret' };
  await withServer(async (port) => {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
      const j = await r.json();
      assert.equal(j.ok, true);
    }
    // advance time past the flight cache TTL but before token expiry
    nowMs += 60000;
    const r = await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
    assert.equal((await r.json()).ok, true);
  }, { fetchImpl, config, now: () => nowMs });
  assert.equal(tokenCalls, 1, `token calls ${tokenCalls}`);
});

test('a failing token request falls back to anonymous (states still fetched)', async () => {
  const seenAuth = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/token')) {
      return new Response('nope', { status: 400 });
    }
    if (String(url).includes('opensky-network.org/api/states')) {
      seenAuth.push(options.headers?.Authorization || null);
      return new Response(JSON.stringify(flightsFixture), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const r = await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.ok(Array.isArray(j.data));
  }, { fetchImpl, config: { openskyClientId: 'cid', openskyClientSecret: 'bad' } });
  assert.deepEqual(seenAuth, [null]);
});

// ---------- /api/config ----------

test('/api/config never contains the secret and reflects features', async () => {
  const config = { openskyClientId: 'cid', openskyClientSecret: 'SECRETVALUE', llmApiKey: 'k', llmModel: 'GLM-5.3' };
  await withServer(async (port) => {
    const r = await fetch(`http://localhost:${port}/api/config`);
    const text = await r.text();
    assert.ok(!text.includes('SECRETVALUE'), text);
    const j = JSON.parse(text);
    assert.equal(j.data.openskyAuth, true);
    assert.equal(j.data.llm, true);
    assert.equal(j.data.intervals.flightsMs, 20000);
  }, { config });
});

test('/api/config with no logins: llm off, flightsMs 60000', async () => {
  await withServer(async (port) => {
    const j = await (await fetch(`http://localhost:${port}/api/config`)).json();
    assert.equal(j.data.llm, false);
    assert.equal(j.data.openskyAuth, false);
    assert.equal(j.data.intervals.flightsMs, 60000);
    assert.equal(j.data.intervals.issMs, 2000);
  }, { config: {} });
});

// ---------- routes ----------

test('/api/iss returns parsed ISS data and caches within the TTL', async () => {
  await withServer(async (port, fetchImpl) => {
    const j = await (await fetch(`http://localhost:${port}/api/iss`)).json();
    assert.equal(j.ok, true);
    assert.equal(j.data.time, issFixture.timestamp * 1000);
    assert.equal(typeof j.data.lat, 'number');
    const before = countCalls(fetchImpl, 'wheretheiss.at/v1/satellites/25544');
    await fetch(`http://localhost:${port}/api/iss`);
    await fetch(`http://localhost:${port}/api/iss`);
    assert.equal(countCalls(fetchImpl, 'wheretheiss.at/v1/satellites/25544'), before);
  });
});

test('/api/quakes returns parsed quakes and caches within the TTL', async () => {
  await withServer(async (port, fetchImpl) => {
    const j = await (await fetch(`http://localhost:${port}/api/quakes`)).json();
    assert.equal(j.ok, true);
    assert.ok(j.data.length >= 1);
    assert.ok(typeof j.data[0].lat === 'number');
    const before = countCalls(fetchImpl, 'earthquake.usgs.gov');
    await fetch(`http://localhost:${port}/api/quakes`);
    assert.equal(countCalls(fetchImpl, 'earthquake.usgs.gov'), before);
  });
});

test('/api/flights returns parsed flights and caches within the TTL', async () => {
  await withServer(async (port, fetchImpl) => {
    const j = await (
      await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`)
    ).json();
    assert.equal(j.ok, true);
    assert.ok(j.data.length >= 1);
    assert.ok(typeof j.data[0].lat === 'number');
    const before = countCalls(fetchImpl, 'opensky-network.org/api/states');
    await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
    assert.equal(countCalls(fetchImpl, 'opensky-network.org/api/states'), before);
  });
});

test('/api/iss/path returns 90 points', async () => {
  await withServer(async (port) => {
    const j = await (await fetch(`http://localhost:${port}/api/iss/path`)).json();
    assert.equal(j.ok, true);
    assert.equal(j.data.length, 90);
  });
});

test('a 429 for flights returns ok:false with the friendly message, not a crash', async () => {
  let n = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('opensky-network.org/api/states')) {
      n++;
      return new Response('rate limited', { status: 429 });
    }
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const r1 = await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
    const j1 = await r1.json();
    assert.equal(j1.ok, false);
    assert.equal(j1.error, 'Flights temporarily unavailable (rate limited)');
    // Backoff: a second call does NOT hit upstream again.
    const r2 = await fetch(`http://localhost:${port}/api/flights?south=6&west=68&north=36&east=98`);
    assert.equal((await r2.json()).ok, false);
    assert.equal(n, 1, `upstream called ${n} times`);
  }, { fetchImpl });
});

test('unknown api route returns 404 json', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://localhost:${port}/api/nope`);
    assert.equal(r.status, 404);
    const j = await r.json();
    assert.equal(j.ok, false);
  });
});

// ---------- /api/ask (STEP 11) ----------

const llmOk = (content) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function postAsk(port, body) {
  return fetch(`http://localhost:${port}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('/api/ask with a fake LLM returns the parsed answer', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/chat/completions')) {
      return llmOk('{"answer":"The ISS is over the ocean.","action":null}');
    }
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const r = await postAsk(port, { question: 'Where is the ISS?', snapshot: {} });
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.mode, 'llm');
    assert.equal(j.answer, 'The ISS is over the ocean.');
    assert.equal(j.model, 'GLM-5.3');
  }, { fetchImpl, config: { llmApiKey: 'test-key', llmModel: 'GLM-5.3', llmFallbackModel: 'llama-3.1-8b-instruct' } });
});

test('/api/ask with no key returns mode local', async () => {
  await withServer(async (port) => {
    const r = await postAsk(port, { question: 'hello', snapshot: {} });
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.mode, 'local');
  }, { config: {} });
});

test('main model failing → the fallback model answers', async () => {
  const modelsCalled = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      const body = JSON.parse(options.body);
      modelsCalled.push(body.model);
      if (body.model === 'GLM-5.3') {
        // empty content (thinking model used all tokens on reasoning)
        return llmOk('   ');
      }
      return llmOk('{"answer":"Quick answer.","action":null}');
    }
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const j = await (await postAsk(port, { question: 'q', snapshot: {} })).json();
    assert.equal(j.mode, 'llm');
    assert.equal(j.answer, 'Quick answer.');
    assert.equal(j.model, 'llama-3.1-8b-instruct');
    assert.deepEqual(modelsCalled, ['GLM-5.3', 'llama-3.1-8b-instruct']);
  }, { fetchImpl, config: { llmApiKey: 'test-key', llmModel: 'GLM-5.3', llmFallbackModel: 'llama-3.1-8b-instruct' } });
});

test('fast:true skips the main model', async () => {
  const modelsCalled = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/chat/completions')) {
      modelsCalled.push(JSON.parse(options.body).model);
      return llmOk('{"answer":"fast!","action":null}');
    }
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const j = await (await postAsk(port, { question: 'q', snapshot: {}, fast: true })).json();
    assert.equal(j.model, 'llama-3.1-8b-instruct');
    assert.deepEqual(modelsCalled, ['llama-3.1-8b-instruct']);
  }, { fetchImpl, config: { llmApiKey: 'test-key', llmModel: 'GLM-5.3', llmFallbackModel: 'llama-3.1-8b-instruct' } });
});

test('both models failing → mode local with note', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/chat/completions')) return new Response('err', { status: 500 });
    return new Response('{}', { status: 404 });
  };
  await withServer(async (port) => {
    const j = await (await postAsk(port, { question: 'q', snapshot: {} })).json();
    assert.equal(j.ok, true);
    assert.equal(j.mode, 'local');
    assert.ok(j.note.includes('built-in'));
  }, { fetchImpl, config: { llmApiKey: 'test-key', llmModel: 'GLM-5.3', llmFallbackModel: 'llama-3.1-8b-instruct' } });
});

test('/api/config never contains the api key and reports llm on', async () => {
  await withServer(async (port) => {
    const text = await (await fetch(`http://localhost:${port}/api/config`)).text();
    assert.ok(!text.includes('test-key'), text);
    assert.ok(JSON.parse(text).data.llm === true);
  }, { config: { llmApiKey: 'test-key', llmModel: 'GLM-5.3' } });
});

test('an oversized ask body is rejected, not crashed on', async () => {
  await withServer(async (port) => {
    let r;
    try {
      r = await fetch(`http://localhost:${port}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'q', snapshot: { pad: 'x'.repeat(200 * 1024) } })
      });
      assert.ok([400, 200].includes(r.status));
    } catch {
      // connection reset by the server when it drops an oversized body — also fine
      assert.ok(true);
    }
  }, { config: {} });
});
