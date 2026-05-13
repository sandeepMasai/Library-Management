const PlanConfig = require("../models/PlanConfig");
const logger = require("./logger");

const DEFAULT_PLANS = {
  trial: { title: "Trial Plan", price: 99, durationDays: 30 },
  monthly: { title: "Pro Monthly", price: 999, durationDays: 30 },
  "6month": { title: "Pro 6 Month", price: 4999, durationDays: 180 },
  yearly: { title: "Pro Yearly", price: 9999, durationDays: 365 },
};

const ORDERED_KEYS = ["trial", "monthly", "6month", "yearly"];

const hooks = {
  onCacheHit: null,
  onCacheMiss: null,
  onSeed: null,
};

let cacheGeneration = 0;
/** @type {{ generation: number; expiresAt: number; value: Array<{ key: string; title: string; price: number; durationDays: number }> } | null} */
let listCache = null;

let ensureInFlight = null;

function setPlanConfigHooks(patch = {}) {
  Object.assign(hooks, patch);
}

function getListCacheTtlMs() {
  const raw = Number.parseInt(
    process.env.PLAN_CONFIG_LIST_CACHE_TTL_MS || "60000",
    10
  );
  return Number.isFinite(raw) && raw >= 0 ? Math.min(Math.max(raw, 0), 3600_000) : 60_000;
}

function isBulkDuplicateError(error) {
  if (!error) return false;
  if (error.code === 11000) return true;
  const errs = error.writeErrors;
  if (Array.isArray(errs) && errs.some((w) => w.code === 11000)) return true;
  return false;
}

function readListCache(scope = "listPlanDefs") {
  const now = Date.now();
  if (
    listCache &&
    listCache.generation === cacheGeneration &&
    listCache.expiresAt > now
  ) {
    try {
      hooks.onCacheHit?.({ scope });
    } catch (e) {
      logger.warn("planConfig hook onCacheHit failed", { message: e?.message });
    }
    if (String(process.env.PLAN_CONFIG_CACHE_DEBUG || "").trim() === "1") {
      logger.debug("plan_config_cache_hit", {
        event: "plan_config_cache_hit",
        scope,
        ttlRemainingMs: listCache.expiresAt - now,
      });
    }
    return listCache.value;
  }
  return null;
}

function writeListCache(value) {
  const ttl = getListCacheTtlMs();
  if (ttl === 0) {
    listCache = null;
    return;
  }
  listCache = {
    generation: cacheGeneration,
    expiresAt: Date.now() + ttl,
    value,
  };
}

/**
 * Clears read-through cache after admin updates (or tests). Next read refetches DB.
 */
function invalidatePlanConfigCache(reason = "unspecified") {
  cacheGeneration += 1;
  listCache = null;
  logger.debug("plan_config_cache_invalidated", {
    event: "plan_config_cache_invalidated",
    reason: String(reason).slice(0, 120),
    generation: cacheGeneration,
  });
}

/**
 * Optional app startup: warms list cache and ensures rows exist.
 */
async function warmupPlanConfigCache() {
  await listPlanDefs();
}

function buildPlanDefsFromRows(rows) {
  const byKey = new Map((rows || []).map((r) => [String(r.key), r]));
  return ORDERED_KEYS.map((key) => {
    const row = byKey.get(key) || { key, ...DEFAULT_PLANS[key] };
    return {
      key,
      title: row.title || DEFAULT_PLANS[key].title,
      price: Number(row.price ?? DEFAULT_PLANS[key].price),
      durationDays: Number(row.durationDays ?? DEFAULT_PLANS[key].durationDays),
    };
  });
}

let listRebuildInFlight = null;

async function ensurePlanConfigSeeded() {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    const keys = Object.keys(DEFAULT_PLANS);
    const existing = await PlanConfig.find({ key: { $in: keys } })
      .select("key")
      .lean();
    const have = new Set((existing || []).map((x) => x.key));

    const toInsert = [];
    for (const key of keys) {
      if (have.has(key)) continue;
      toInsert.push({ key, ...DEFAULT_PLANS[key] });
    }

    if (toInsert.length) {
      try {
        await PlanConfig.insertMany(toInsert, { ordered: false });
        logger.info("PlanConfig seed inserted defaults", {
          event: "plan_config_seed_insert",
          keys: toInsert.map((r) => r.key),
          count: toInsert.length,
        });
        try {
          hooks.onSeed?.({ inserted: toInsert.map((r) => r.key) });
        } catch (e) {
          logger.warn("planConfig hook onSeed failed", { message: e?.message });
        }
      } catch (error) {
        if (isBulkDuplicateError(error)) {
          logger.debug("PlanConfig seed skipped (duplicate race)", {
            event: "plan_config_seed_duplicate_race",
            attemptedKeys: toInsert.map((r) => r.key),
          });
        } else {
          logger.warn("PlanConfig seed insert failed", {
            event: "plan_config_seed_error",
            message: error?.message,
            code: error?.code,
          });
        }
      }
    }
  })();

  try {
    await ensureInFlight;
  } finally {
    ensureInFlight = null;
  }
}

async function listPlanDefs() {
  const cached = readListCache();
  if (cached) return cached;

  try {
    hooks.onCacheMiss?.({ scope: "listPlanDefs" });
  } catch (e) {
    logger.warn("planConfig hook onCacheMiss failed", { message: e?.message });
  }

  if (listRebuildInFlight) {
    return listRebuildInFlight;
  }

  listRebuildInFlight = (async () => {
    await ensurePlanConfigSeeded();
    const rows = await PlanConfig.find({ active: true })
      .select("key title price durationDays")
      .lean();
    const value = buildPlanDefsFromRows(rows);
    writeListCache(value);
    return value;
  })();

  try {
    return await listRebuildInFlight;
  } finally {
    listRebuildInFlight = null;
  }
}

async function getPlanDef(plan) {
  const key = String(plan || "").trim().toLowerCase();
  if (!DEFAULT_PLANS[key]) return null;

  const cachedList = readListCache("getPlanDef");
  if (cachedList) {
    const row = cachedList.find((r) => r.key === key);
    if (row) {
      return { ...row };
    }
  }

  const list = await listPlanDefs();
  const hit = list.find((r) => r.key === key);
  return hit ? { ...hit } : null;
}

module.exports = {
  DEFAULT_PLANS,
  ensurePlanConfigSeeded,
  listPlanDefs,
  getPlanDef,
  invalidatePlanConfigCache,
  warmupPlanConfigCache,
  setPlanConfigHooks,
};
