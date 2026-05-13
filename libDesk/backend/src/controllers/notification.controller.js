const logger = require("../utils/logger");
const { sendError } = require("../utils/response");
const { buildRequestCorrelation } = require("../utils/auditMetadata");

const NOT_IMPLEMENTED_CODE = "NOT_IMPLEMENTED";

const PUBLIC_NOT_IMPLEMENTED_MESSAGE =
  "This endpoint is not implemented.";

/** Non-production hint: no file paths or internal module names. */
const DEV_MIGRATION_HINT =
  "This notification endpoint is not implemented. Use /api/notifications for supported operations.";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function collectRequestMeta(req) {
  const now = new Date().toISOString();
  const corr = buildRequestCorrelation(req);
  return {
    event: "unimplemented_notification_route",
    timestamp: now,
    method: String(req.method || "GET").toUpperCase(),
    path: req.originalUrl || req.path || "",
    ip: req.ip || req.socket?.remoteAddress || null,
    userId: req.user?.userId ?? null,
    role: req.user?.role ?? null,
    libraryId: req.user?.libraryId ?? null,
    correlationId: corr.correlationId || corr.requestId || null,
    requestId: corr.requestId,
    idempotencyKey: corr.idempotencyKey,
    userAgent:
      typeof req.get === "function" ? req.get("user-agent") || null : null,
    referer:
      typeof req.get === "function" ? req.get("referer") || null : null,
  };
}

function buildResponseMessage() {
  if (isProduction()) {
    return PUBLIC_NOT_IMPLEMENTED_MESSAGE;
  }
  return DEV_MIGRATION_HINT;
}

function buildResponseDataFromMeta(meta) {
  const base = { code: NOT_IMPLEMENTED_CODE };
  if (isProduction()) {
    return base;
  }
  return {
    ...base,
    debug: {
      method: meta.method,
      path: meta.path,
      timestamp: meta.timestamp,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
      hint: "/api/notifications",
    },
  };
}

/**
 * Fallback when notification routes point at the controller layer without handlers.
 * Logs server-side; returns 501 with stable client shape (same as other notImplemented controllers).
 */
async function notImplemented(req, res) {
  const meta = collectRequestMeta(req);
  logger.warn("Unimplemented notification route accessed", meta);

  const message = buildResponseMessage();
  const data = buildResponseDataFromMeta(meta);

  return sendError(res, message, 501, data);
}

module.exports = {
  notImplemented,
};
