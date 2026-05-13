const logger = require("../utils/logger");
const { sendError } = require("../utils/response");
const { buildRequestCorrelation } = require("../utils/auditMetadata");

const isProduction = process.env.NODE_ENV === "production";

function collectErrorLogContext(req, extra = {}) {
  const corr = buildRequestCorrelation(req);
  return {
    event: "http_error_response",
    method: req.method,
    path: req.originalUrl || req.path,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userId: req.user?.userId ?? null,
    role: req.user?.role ?? null,
    libraryId: req.user?.libraryId ?? null,
    ...extra,
  };
}

function isMongoDuplicateKey(error) {
  return error?.code === 11000 || error?.code === 11001;
}

/**
 * Prefer index shape from Mongo duplicate-key errors; fall back to route prefix heuristics.
 */
function getDuplicateKeyMessage(req, error) {
  const keyPattern = error?.keyPattern || error?.keypattern || {};
  const keys = Object.keys(keyPattern).sort().join(",");

  if (keys === "email,libraryId" || keys === "libraryId,email") {
    return "Email already exists for this tenant";
  }
  if (keys === "libraryId,mobile" || keys === "mobile,libraryId") {
    return "Mobile number already exists for this tenant";
  }
  if (keys === "libraryId,name" || keys === "name,libraryId") {
    const path = `${req.baseUrl || ""}${req.path || ""}`;
    if (path.startsWith("/api/spaces")) return "Space name already exists";
    if (path.startsWith("/api/shifts")) return "Shift name already exists";
    return "Duplicate name for this tenant";
  }
  if (keys === "libraryId,username" || keys === "username,libraryId") {
    return "Username already exists for this tenant";
  }
  if (keys.includes("tokenhash") || keys.includes("tokenHash")) {
    return "Duplicate record";
  }

  const path = `${req.baseUrl || ""}${req.path || ""}`;
  if (path.startsWith("/api/auth")) return "Email already exists";
  if (path.startsWith("/api/allocations")) {
    return "Allocation conflict (seat/shift already filled or student already allocated)";
  }
  if (path.startsWith("/api/spaces")) return "Space name already exists";
  if (path.startsWith("/api/shifts")) return "Shift name already exists";
  if (path.startsWith("/api/seats")) return "Seat number already exists";
  return "Duplicate record";
}

function formatValidationErrorsForDev(error) {
  if (!error?.errors || typeof error.errors !== "object") {
    return error?.message || "Validation failed";
  }
  return Object.entries(error.errors)
    .map(([path, e]) => `${path}: ${e?.message || "invalid"}`)
    .slice(0, 12)
    .join("; ");
}

function classifyError(error) {
  if (isMongoDuplicateKey(error)) {
    return {
      statusCode: 409,
      kind: "duplicate_key",
      metricsLabel: "duplicate_key",
    };
  }
  if (error?.name === "ValidationError") {
    return {
      statusCode: 400,
      kind: "validation",
      metricsLabel: "mongoose_validation",
    };
  }
  if (error?.name === "CastError") {
    return {
      statusCode: 400,
      kind: "cast",
      metricsLabel: "mongoose_cast",
    };
  }

  const rawStatus = Number(error?.statusCode ?? error?.status);
  if (rawStatus === 429) {
    return {
      statusCode: 429,
      kind: "rate_limit",
      metricsLabel: "rate_limit",
    };
  }
  if (Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus < 600) {
    const kind =
      rawStatus === 401 || rawStatus === 403 ? "auth_security" : "client_http";
    return {
      statusCode: rawStatus,
      kind,
      metricsLabel: `http_${rawStatus}`,
    };
  }
  return {
    statusCode: 500,
    kind: "server",
    metricsLabel: "server_error",
  };
}

function resolveClientMessage(error, classification, req) {
  if (classification.kind === "duplicate_key") {
    return getDuplicateKeyMessage(req, error);
  }
  if (classification.kind === "validation") {
    if (isProduction) return "Validation failed";
    return formatValidationErrorsForDev(error);
  }
  if (classification.kind === "cast") {
    if (isProduction) return "Invalid request";
    const p = error?.path ? String(error.path) : "id";
    return `Invalid ${p}`;
  }
  if (classification.kind === "rate_limit") {
    return error?.message && String(error.message).length < 200
      ? String(error.message)
      : "Too many requests";
  }
  const sc = classification.statusCode;
  if (sc >= 500 && isProduction) {
    return "Internal server error";
  }
  if (error?.message && typeof error.message === "string") {
    return error.message;
  }
  return "Internal server error";
}

function mergeErrorData(error, classification) {
  const existing = error?.data;
  if (existing != null && (typeof existing !== "object" || Array.isArray(existing))) {
    return existing;
  }

  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  if (classification.kind === "validation" && isProduction) {
    base.code = base.code || "VALIDATION_ERROR";
  }
  if (classification.kind === "cast" && isProduction) {
    base.code = base.code || "INVALID_IDENTIFIER";
  }
  if (classification.kind === "rate_limit") {
    base.code = base.code || "RATE_LIMITED";
  }

  return Object.keys(base).length ? base : null;
}

function errorHandler(error, req, res, _next) {
  const classification = classifyError(error);
  const statusCode = classification.statusCode;
  const isServerError = statusCode >= 500;
  const message = resolveClientMessage(error, classification, req);
  const responseData = mergeErrorData(error, classification);

  const logMeta = collectErrorLogContext(req, {
    classification: classification.kind,
    metricsLabel: classification.metricsLabel,
    statusCode,
    responseMessage: message,
    internalMessage:
      classification.kind === "duplicate_key"
        ? undefined
        : error?.message && String(error.message).slice(0, 500),
    errorName: error?.name,
    errorCode: error?.code,
    duplicateKeyPattern:
      classification.kind === "duplicate_key" ? error?.keyPattern : undefined,
    stack: isServerError && !isProduction ? error?.stack : undefined,
  });

  if (isServerError) {
    logger.error("Unhandled server error", logMeta);
  } else {
    logger.warn("Handled client error", logMeta);
  }

  return sendError(res, message, statusCode, responseData);
}

module.exports = {
  errorHandler,
};
