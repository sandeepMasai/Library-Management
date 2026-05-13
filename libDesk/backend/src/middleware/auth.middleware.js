const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { createHttpError } = require("../utils/httpError");
const logger = require("../utils/logger");
const { buildRequestCorrelation } = require("../utils/auditMetadata");
const { getAccessTokenSecret, getJwtVerifyOptions } = require("../utils/token");

const AUTH_ROLES = new Set(["admin", "library", "student", "staff"]);

function collectAuthLogMeta(req, extra = {}) {
  const corr = buildRequestCorrelation(req);
  return {
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userAgent:
      typeof req.get === "function" ? req.get("user-agent") || null : null,
    ...extra,
  };
}

function logAuthFailure(req, reason, meta = {}) {
  logger.warn("Authentication failed", {
    event: "auth_failure",
    reason,
    ...collectAuthLogMeta(req, meta),
  });
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw createHttpError(401, "Authorization header missing");
  }

  const parts = String(authHeader).trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    throw createHttpError(401, "Authorization header must use Bearer token");
  }

  return parts[1];
}

/**
 * Reject refresh tokens if they were signed with the access secret (misconfiguration)
 * or if payload explicitly marks refresh (aligns with refresh-token ecosystem).
 */
function assertAccessTokenPayload(payload) {
  if (payload?.type === "refresh" || payload?.tokenType === "refresh") {
    const err = createHttpError(401, "Invalid auth token");
    err.data = { code: "WRONG_TOKEN_TYPE" };
    throw err;
  }
  const requireTyp = String(process.env.AUTH_JWT_REQUIRE_ACCESS_TYP || "")
    .trim()
    .toLowerCase();
  if (requireTyp === "true" || requireTyp === "1") {
    if (
      payload?.typ !== "access" &&
      payload?.token_use !== "access" &&
      payload?.tokenType !== "access"
    ) {
      const err = createHttpError(401, "Invalid auth token");
      err.data = { code: "ACCESS_TOKEN_REQUIRED" };
      throw err;
    }
  }
}

function validateAuthPayload(payload) {
  assertAccessTokenPayload(payload);

  const userId = String(payload?.userId || "").trim();
  const role = String(payload?.role || "").trim();

  if (!userId || userId.length > 128) {
    throw createHttpError(401, "Invalid auth token payload");
  }
  if (!role || !AUTH_ROLES.has(role)) {
    throw createHttpError(401, "Invalid auth token payload");
  }

  let libraryId = payload.libraryId ?? null;
  if (libraryId != null && libraryId !== "") {
    const asString = String(libraryId).trim();
    if (!mongoose.Types.ObjectId.isValid(asString)) {
      throw createHttpError(401, "Invalid auth token payload");
    }
    libraryId = asString;
  } else {
    libraryId = null;
  }

  return {
    userId,
    role,
    libraryId,
  };
}

/**
 * Optional DB-backed identity gate (off by default). Enable with AUTH_ENABLE_IDENTITY_GATE=true
 * after User rows exist for subjects; unknown users skip the gate for migration safety.
 */
async function assertIdentityGateIfEnabled(user) {
  const enabled = String(process.env.AUTH_ENABLE_IDENTITY_GATE || "")
    .trim()
    .toLowerCase();
  if (enabled !== "true" && enabled !== "1") return;

  const User = require("../models/User");
  const row = await User.findOne({ subjectKey: user.userId })
    .select("isActive accountStatus")
    .lean();

  if (!row) return;

  if (!row.isActive || (row.accountStatus && row.accountStatus !== "active")) {
    const err = createHttpError(403, "Account is not active");
    err.data = { code: "IDENTITY_SUSPENDED" };
    throw err;
  }
}

async function requireAuth(req, res, next) {
  if (!(process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET)) {
    logger.error(
      "JWT authentication is not configured. Set AUTH_JWT_SECRET or JWT_SECRET."
    );
    return next(createHttpError(500, "Authentication is not configured"));
  }

  try {
    const token = getBearerToken(req);
    const verifyOpts = getJwtVerifyOptions("access");
    const payload = jwt.verify(token, getAccessTokenSecret(), verifyOpts);

    const user = validateAuthPayload(payload);
    await assertIdentityGateIfEnabled(user);

    req.user = user;
    return next();
  } catch (error) {
    if (error?.statusCode) {
      logAuthFailure(req, error.message, {
        statusCode: error.statusCode,
        code: error?.data?.code,
      });
      return next(error);
    }

    if (error?.name === "TokenExpiredError") {
      logAuthFailure(req, "Auth token expired", {
        expiredAt: error.expiredAt,
        errorName: error.name,
      });
      return next(createHttpError(401, "Auth token expired"));
    }

    if (error?.name === "JsonWebTokenError" || error?.name === "NotBeforeError") {
      logAuthFailure(req, "Invalid auth token", {
        errorName: error.name,
        jwtMessage: error.message,
      });
      return next(createHttpError(401, "Invalid auth token"));
    }

    logAuthFailure(req, "Invalid auth token", {
      errorName: error?.name || "UnknownError",
    });
    return next(createHttpError(401, "Invalid auth token"));
  }
}

module.exports = {
  requireAuth,
  /** @deprecated Prefer `require("../utils/token").getJwtVerifyOptions` — re-exported for compatibility. */
  getJwtVerifyOptions,
};
