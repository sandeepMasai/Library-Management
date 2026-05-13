const { createHttpError } = require("../utils/httpError");
const logger = require("../utils/logger");
const { buildRequestCorrelation } = require("../utils/auditMetadata");

/**
 * Canonical role names (JWT / req.user.role). Align with auth.middleware AUTH_ROLES.
 */
const ROLES = Object.freeze({
  ADMIN: "admin",
  LIBRARY: "library",
  STUDENT: "student",
  STAFF: "staff",
});

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function createNormalizedRoleSet(...roles) {
  const set = new Set();
  for (const r of roles) {
    const n = normalizeRole(r);
    if (n) set.add(n);
  }
  return set;
}

function isTruthyEnv(name) {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1";
}

/** When enabled, admin JWT may satisfy routes that list only dominated roles (never changes admin-only routes). */
function isRoleHierarchyEnabled() {
  return isTruthyEnv("AUTH_RBAC_USE_ROLE_HIERARCHY");
}

/** When enabled, req.user may carry optional suspension fields enforced here (see isUserMarkedSuspended). */
function isSuspendedEnforcementEnabled() {
  return isTruthyEnv("AUTH_RBAC_ENFORCE_SUSPENDED_USER");
}

/**
 * Optional dominance map: key = authenticated role, values = weaker roles they may satisfy for requireRole(...).
 * Only applied when AUTH_RBAC_USE_ROLE_HIERARCHY is true. Default excludes student self-service from admin bypass.
 */
const ROLE_DOMINATES = Object.freeze({
  admin: new Set(["library", "staff"]),
});

function roleMatchesAllowlist(userNorm, allowedSet) {
  if (!userNorm) return false;
  if (allowedSet.has(userNorm)) return true;
  if (!isRoleHierarchyEnabled()) return false;
  const dominated = ROLE_DOMINATES[userNorm];
  if (!dominated) return false;
  for (const required of allowedSet) {
    if (dominated.has(required)) return true;
  }
  return false;
}

function isUserMarkedSuspended(user) {
  if (!user || typeof user !== "object") return false;
  if (user.suspended === true) return true;
  if (user.isActive === false) return true;
  const st = user.accountStatus;
  if (st != null && String(st).trim().toLowerCase() !== "active") return true;
  return false;
}

/**
 * Tenant-scoped ownership helper for controllers / future middleware.
 * Does not mutate req. Today req.user usually has libraryId for library/staff/student.
 */
function tenantOwnershipMatches(req, resourceLibraryId) {
  if (resourceLibraryId == null || resourceLibraryId === "") {
    return { ok: true, skipped: true };
  }
  if (!req.user?.libraryId) {
    return { ok: false, reason: "no_tenant_on_user" };
  }
  const a = String(req.user.libraryId);
  const b = String(resourceLibraryId);
  return { ok: a === b, skipped: false };
}

function collectRoleLogMeta(req, extra = {}) {
  const corr = buildRequestCorrelation(req);
  return {
    event: "rbac_decision",
    method: req.method,
    path: req.originalUrl || req.path,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userId: req.user?.userId || null,
    role: req.user?.role || null,
    libraryId: req.user?.libraryId ?? null,
    rbacCacheLayer: "inline",
    ...extra,
  };
}

/**
 * Role gate: unchanged contract — requireRole("admin", "library"), 401 if no req.user / no role, 403 if not allowed.
 * Async so DB-backed permission or cache layers can be awaited later without changing the call site.
 */
function requireRole(...roles) {
  const allowedSet = createNormalizedRoleSet(...roles);
  const allowedRolesList = Array.from(allowedSet);

  return async (req, res, next) => {
    try {
      if (!allowedSet.size) {
        logger.error(
          "Role middleware misconfigured: no allowed roles provided",
          collectRoleLogMeta(req)
        );
        return next(createHttpError(500, "Role middleware is not configured"));
      }

      if (!req.user) {
        logger.debug(
          "Role check failed: user is not authenticated",
          collectRoleLogMeta(req)
        );
        return next(createHttpError(401, "Unauthorized"));
      }

      const role = normalizeRole(req.user.role);
      if (!role) {
        logger.warn(
          "Role check failed: authenticated user has no role",
          collectRoleLogMeta(req)
        );
        return next(createHttpError(401, "Unauthorized"));
      }

      if (isSuspendedEnforcementEnabled() && isUserMarkedSuspended(req.user)) {
        logger.warn(
          "Role check failed: suspended or inactive user",
          collectRoleLogMeta(req, { normalizedRole: role })
        );
        return next(createHttpError(403, "Forbidden"));
      }

      if (!roleMatchesAllowlist(role, allowedSet)) {
        logger.warn("Role check failed: access denied", {
          ...collectRoleLogMeta(req),
          normalizedRole: role,
          allowedRoles: allowedRolesList,
          hierarchyEnabled: isRoleHierarchyEnabled(),
          decision: "deny",
        });
        return next(createHttpError(403, "Forbidden"));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  requireRole,
  ROLES,
  normalizeRole,
  createNormalizedRoleSet,
  roleMatchesAllowlist,
  tenantOwnershipMatches,
};
