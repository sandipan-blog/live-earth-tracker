import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCache, cached } from '../src/cache.js';

test('get returns undefined after the TTL', () => {
  const c = createCache();
  c.set('k', 42, 1000, 0);
  assert.equal(c.get('k', 500), 42);
  assert.equal(c.get('k', 999), 42);
  assert.equal(c.get('k', 1000), undefined); // expired
  assert.equal(c.get('missing', 0), undefined);
});

test('cached calls the loader once within the TTL', async () => {
  const c = createCache();
  let calls = 0;
  const loader = async () => {
    calls++;
    return { value: 'hello' };
  };
  const a = await cached(c, 'k', 5000, 0, loader);
  const b = await cached(c, 'k', 5000, 100, loader);
  assert.equal(calls, 1);
  assert.deepEqual(a, { value: 'hello' });
  assert.equal(b.value, 'hello');
  assert.equal(b.stale, undefined);
  // After expiry the loader runs again.
  const d = await cached(c, 'k', 5000, 6000, loader);
  assert.equal(calls, 2);
  assert.equal(d.value, 'hello');
});

test('a stale value is returned when the loader fails', async () => {
  const c = createCache();
  let fail = false;
  const loader = async () => {
    if (fail) throw new Error('upstream down');
    return { value: 'good' };
  };
  await cached(c, 'k', 1000, 0, loader);
  fail = true;
  const out = await cached(c, 'k', 10000, 5000, loader);
  assert.equal(out.value, 'good');
  assert.equal(out.stale, true);
});

test('with no old value the error is rethrown', async () => {
  const c = createCache();
  await assert.rejects(
    () => cached(c, 'never', 1000, 0, async () => { throw new Error('boom'); }),
    /boom/
  );
});
