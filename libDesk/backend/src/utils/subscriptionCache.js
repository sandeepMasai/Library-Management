const logger = require("./logger");

const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_MAX_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MIN_TTL_MS = 1000;

const cache = new Map();

/** Optional hooks for APM / Redis migration (no-op by default). */
let hooks = {
  onHit: null,
  onMiss: null,
  onSetError: null,
  onEviction: null,
};

const metrics = {
  hits: 0,
  misses: 0,
  evictions: 0,
  setErrors: 0,
  invalidations: 0,
};

function setSubscriptionCacheHooks(next = {}) {
  hooks = { ...hooks, ...next };
}

function getSubscriptionCacheMetrics() {
  return { ...metrics, size: cache.size };
}

function resetSubscriptionCacheMetrics() {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.evictions = 0;
  metrics.setErrors = 0;
  metrics.invalidations = 0;
}

function getTtlMs() {
  const raw = Number(process.env.SUBSCRIPTION_CACHE_TTL_MS || DEFAULT_TTL_MS);
  const min = Number(process.env.SUBSCRIPTION_CACHE_MIN_TTL_MS || DEFAULT_MIN_TTL_MS);
  const max = Number(process.env.SUBSCRIPTION_CACHE_MAX_TTL_MS || DEFAULT_MAX_TTL_MS);
  const ttl = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
  const minClamped = Number.isFinite(min) && min > 0 ? min : DEFAULT_MIN_TTL_MS;
  const maxClamped = Number.isFinite(max) && max >= minClamped ? max : DEFAULT_MAX_TTL_MS;
  return Math.min(Math.max(ttl, minClamped), maxClamped);
}

function normalizeKey(libraryId) {
  return String(libraryId || "").trim();
}

function readEntry(key) {
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    metrics.evictions += 1;
    try {
      hooks.onEviction?.(key);
    } catch (e) {
      logger.warn("subscription cache hook onEviction failed", { message: e?.message });
    }
    return null;
  }
  return entry;
}

/**
 * Remaining TTL for observability (ms), or null if missing/expired.
 */
function getCacheTtlRemainingMs(libraryId) {
  const key = normalizeKey(libraryId);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return Math.max(0, entry.expiresAt - Date.now());
}

function getCachedLibrary(libraryId) {
  const key = normalizeKey(libraryId);
  if (!key) return null;

  const entry = readEntry(key);
  if (!entry) {
    metrics.misses += 1;
    try {
      hooks.onMiss?.(key);
    } catch (e) {
      logger.warn("subscription cache hook onMiss failed", { message: e?.message });
    }
    return null;
  }

  metrics.hits += 1;
  try {
    hooks.onHit?.(key, entry);
  } catch (e) {
    logger.warn("subscription cache hook onHit failed", { message: e?.message });
  }
  return entry.library;
}

function setCachedLibrary(libraryId, library) {
  const key = normalizeKey(libraryId);
  if (!key || !library) return;

  try {
    cache.set(key, {
      library,
      expiresAt: Date.now() + getTtlMs(),
      storedAt: Date.now(),
    });
  } catch (error) {
    metrics.setErrors += 1;
    try {
      hooks.onSetError?.(key, error);
    } catch (e) {
      logger.warn("subscription cache hook onSetError failed", { message: e?.message });
    }
    logger.warn("subscription cache set failed (request continues without cache)", {
      libraryId: key,
      message: error?.message,
    });
  }
}

function invalidateLibrarySubscriptionCache(libraryId) {
  const key = normalizeKey(libraryId);
  if (!key) return;
  cache.delete(key);
  metrics.invalidations += 1;
}

function clearSubscriptionCache() {
  cache.clear();
}

module.exports = {
  clearSubscriptionCache,
  getCachedLibrary,
  getCacheTtlRemainingMs,
  getSubscriptionCacheMetrics,
  getTtlMs,
  invalidateLibrarySubscriptionCache,
  resetSubscriptionCacheMetrics,
  setCachedLibrary,
  setSubscriptionCacheHooks,
};
