const Library = require("../models/Library");
const { logAction } = require("../utils/audit");
const { buildRequestCorrelation } = require("../utils/auditMetadata");
const { createHttpError } = require("../utils/httpError");
const logger = require("../utils/logger");
const {
  getCachedLibrary,
  getCacheTtlRemainingMs,
  setCachedLibrary,
} = require("../utils/subscriptionCache");
const { ensureLibraryNotExpired } = require("../utils/subscription");
const { libraryHasOperationalAccess } = require("../utils/libraryAccess");

const BYPASS_PREFIXES = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/subscription",
  "/api/payment",
];

/** In-flight DB loads per libraryId (thundering-herd mitigation). */
const inFlightLibraryLoads = new Map();

/** Optional circuit breaker: set SUBSCRIPTION_CB_FAILURE_THRESHOLD > 0 to enable. */
let circuitFailures = 0;
let circuitOpenUntil = 0;

function getDbTimeoutMs() {
  const raw = Number.parseInt(process.env.SUBSCRIPTION_DB_TIMEOUT_MS || "0", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function getCircuitFailureThreshold() {
  const raw = Number.parseInt(
    process.env.SUBSCRIPTION_CB_FAILURE_THRESHOLD || "0",
    10
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function getCircuitResetMs() {
  const raw = Number.parseInt(process.env.SUBSCRIPTION_CB_RESET_MS || "30000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
}

function isCircuitOpen() {
  if (getCircuitFailureThreshold() === 0) return false;
  return Date.now() < circuitOpenUntil;
}

function recordCircuitSuccess() {
  circuitFailures = 0;
}

function recordCircuitFailure() {
  const threshold = getCircuitFailureThreshold();
  if (!threshold) return;
  circuitFailures += 1;
  if (circuitFailures >= threshold) {
    circuitOpenUntil = Date.now() + getCircuitResetMs();
    circuitFailures = 0;
    logger.error("Subscription middleware circuit opened", {
      event: "subscription_cb_open",
      resetMs: getCircuitResetMs(),
      openUntil: circuitOpenUntil,
    });
  }
}

function shouldEnforceLibraryIsActive() {
  const v = String(
    process.env.SUBSCRIPTION_ENFORCE_LIBRARY_ISACTIVE ?? "true"
  )
    .trim()
    .toLowerCase();
  return v !== "false" && v !== "0";
}

function shouldBypassSubscriptionCheck(req) {
  const path = String(req.originalUrl || req.path || "").split("?")[0];
  if (BYPASS_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }
  // Account branding before first payment
  if (path.startsWith("/api/library/profile")) return true;
  if (path.startsWith("/api/user/upload-profile")) return true;
  return false;
}

function runWithTimeout(ms, fn) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) {
    return fn();
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Subscription data source timed out");
      err.statusCode = 503;
      reject(err);
    }, n);
  });
  return Promise.race([fn(), timeout]).finally(() => clearTimeout(timer));
}

function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const out = { ...metadata };
  if (typeof out.path === "string") out.path = out.path.slice(0, 512);
  if (typeof out.userAgent === "string") {
    out.userAgent = out.userAgent.slice(0, 256);
  }
  if (typeof out.message === "string") out.message = out.message.slice(0, 500);
  return out;
}

function getRequestMeta(req, libraryId) {
  const corr = buildRequestCorrelation(req);
  return {
    userId: req.user?.userId || null,
    role: req.user?.role || null,
    libraryId: libraryId || req.user?.libraryId || null,
    ip: String(
      req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        req.ip ||
        "unknown"
    ),
    userAgent: String(req.headers["user-agent"] || ""),
    path: req.originalUrl || req.path,
    method: req.method,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
  };
}

/**
 * @returns {{ library: import("mongoose").Document | null, loadMeta: { fromReq: boolean, cacheHit: boolean, deduped: boolean, loadSource: string } }}
 */
async function loadLibraryForSubscription(req, libraryId) {
  const id = String(libraryId || "").trim();
  const loadMeta = {
    fromReq: false,
    cacheHit: false,
    deduped: false,
    loadSource: "db",
  };

  if (req.library && String(req.library._id || "") === id) {
    loadMeta.fromReq = true;
    loadMeta.loadSource = "req";
    return { library: req.library, loadMeta };
  }

  const cached = getCachedLibrary(id);
  if (cached) {
    loadMeta.cacheHit = true;
    loadMeta.loadSource = "cache";
    req.library = cached;
    return { library: cached, loadMeta };
  }

  if (inFlightLibraryLoads.has(id)) {
    loadMeta.deduped = true;
    loadMeta.loadSource = "deduped";
    const library = await inFlightLibraryLoads.get(id);
    if (library) req.library = library;
    return { library, loadMeta };
  }

  const timeoutMs = getDbTimeoutMs();
  const loadPromise = (async () => {
    try {
      const library = await runWithTimeout(timeoutMs, () =>
        Library.findById(id)
      );
      if (library) {
        req.library = library;
        setCachedLibrary(id, library);
      }
      return library;
    } finally {
      inFlightLibraryLoads.delete(id);
    }
  })();

  inFlightLibraryLoads.set(id, loadPromise);
  const library = await loadPromise;
  return { library, loadMeta };
}

/**
 * Blocks access to protected library features when subscription is expired.
 * Allows:
 * - login
 * - viewing subscription
 * - payment endpoints (so user can upgrade)
 */
async function requireNotExpiredSubscription(req, res, next) {
  const startedAt = Date.now();
  try {
    if (shouldBypassSubscriptionCheck(req)) return next();
    if (req.user?.role !== "library") return next();
    const libraryId = req.user?.libraryId;
    if (!libraryId) return next(createHttpError(401, "Unauthorized"));

    if (isCircuitOpen()) {
      logger.warn("Subscription check skipped (circuit open)", {
        event: "subscription_circuit_skip",
        ...getRequestMeta(req, libraryId),
      });
      return next(
        createHttpError(
          503,
          "Subscription check temporarily unavailable. Please try again."
        )
      );
    }

    const { library: lib, loadMeta } = await loadLibraryForSubscription(
      req,
      libraryId
    );
    if (!lib) {
      recordCircuitSuccess();
      return next(createHttpError(404, "Library not found"));
    }

    if (shouldEnforceLibraryIsActive() && lib.isActive === false) {
      const meta = getRequestMeta(req, libraryId);
      await logAction({
        action: "library_inactive_blocked",
        userId: meta.userId,
        role: meta.role,
        libraryId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: sanitizeAuditMetadata({
          path: meta.path,
          method: meta.method,
        }),
      });
      recordCircuitSuccess();
      const err = createHttpError(403, "Library account is not active");
      err.data = { code: "LIBRARY_INACTIVE" };
      return next(err);
    }

    const timeoutMs = getDbTimeoutMs();
    await runWithTimeout(timeoutMs, () => ensureLibraryNotExpired(lib));
    setCachedLibrary(libraryId, lib);
    recordCircuitSuccess();

    if (!libraryHasOperationalAccess(lib)) {
      const meta = getRequestMeta(req, libraryId);
      const subscriptionStatus = String(lib.subscriptionStatus || "")
        .trim()
        .toLowerCase();
      const action =
        subscriptionStatus === "expired"
          ? "subscription_expired_blocked"
          : "subscription_inactive_blocked";
      await logAction({
        action,
        userId: meta.userId,
        role: meta.role,
        libraryId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: sanitizeAuditMetadata({
          path: meta.path,
          method: meta.method,
        }),
      });

      const isExpired = subscriptionStatus === "expired";
      const err = createHttpError(
        402,
        isExpired
          ? "Subscription expired. Renew to continue."
          : "Active subscription required. Choose a plan and complete payment.",
        {
          code: isExpired ? "SUBSCRIPTION_EXPIRED" : "SUBSCRIPTION_INACTIVE",
          user: {
            id: lib._id.toString(),
            role: "library",
            plan: lib.plan,
            currentPlanKey: lib.currentPlanKey || "none",
            trialUsed: Boolean(lib.trialUsed),
            subscriptionStatus: lib.subscriptionStatus || (isExpired ? "expired" : "inactive"),
            planExpiryDate: lib.planExpiryDate?.toISOString?.() || null,
          },
        }
      );
      return next(err);
    }

    const elapsedMs = Date.now() - startedAt;
    const cacheTtlRemainingMs = loadMeta.cacheHit
      ? getCacheTtlRemainingMs(libraryId)
      : null;

    logger.debug("Subscription check passed", {
      event: "subscription_check_ok",
      ...getRequestMeta(req, libraryId),
      elapsedMs,
      loadSource: loadMeta.loadSource,
      cacheHit: loadMeta.cacheHit,
      deduped: loadMeta.deduped,
      cacheTtlRemainingMs,
    });
    return next();
  } catch (error) {
    if (error?.statusCode) {
      if (Number(error.statusCode) >= 500) {
        recordCircuitFailure();
      }
      return next(error);
    }

    const meta = getRequestMeta(req);
    recordCircuitFailure();
    logger.error("Subscription check failed", {
      event: "subscription_check_error",
      ...meta,
      message: error?.message,
    });
    await logAction({
      action: "subscription_check_failed",
      userId: meta.userId,
      role: meta.role,
      libraryId: meta.libraryId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: sanitizeAuditMetadata({
        path: meta.path,
        method: meta.method,
        message: error?.message,
      }),
    });
    return next(createHttpError(500, "Subscription check failed"));
  }
}

module.exports = {
  requireNotExpiredSubscription,
};
