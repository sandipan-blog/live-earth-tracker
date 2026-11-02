// Tiny TTL cache with stale fallback. Pure logic: `now` is always passed in.

export function createCache() {
  const store = new Map(); // key -> { value, expiresAt }
  return {
    get(key, now) {
      const e = store.get(key);
      if (!e) return undefined;
      if (now >= e.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key, value, ttlMs, now) {
      store.set(key, { value, expiresAt: now + ttlMs });
    },
    _setForever(key, value) {
      store.set(key, { value, expiresAt: Infinity });
    },
    delete(key) {
      store.delete(key);
    }
  };
}

const STALE_PREFIX = '__stale__';

export async function cached(cache, key, ttlMs, now, loader) {
  const hit = cache.get(key, now);
  if (hit !== undefined) return hit;
  try {
    const value = await loader();
    cache.set(key, value, ttlMs, now);
    // Stale copy never expires (kept only as a fallback for failures).
    cache._setForever(STALE_PREFIX + key, value);
    return value;
  } catch (err) {
    const old = cache.get(STALE_PREFIX + key, Number.MAX_SAFE_INTEGER);
    if (old !== undefined) {
      return { ...old, stale: true };
    }
    throw err;
  }
}
