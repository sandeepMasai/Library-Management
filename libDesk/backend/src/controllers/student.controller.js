const logger = require("../utils/logger");
const { sendError } = require("../utils/response");

const NOT_IMPLEMENTED_CODE = "NOT_IMPLEMENTED";

/** Client-visible copy: generic in production to avoid leaking URL layout. */
const PUBLIC_NOT_IMPLEMENTED_MESSAGE =
  "This endpoint is not implemented.";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function collectRequestMeta(req) {
  const now = new Date().toISOString();
  return {
    event: "unimplemented_route",
    timestamp: now,
    method: String(req.method || "GET").toUpperCase(),
    path: req.originalUrl || req.path || "",
    ip: req.ip || req.socket?.remoteAddress || null,
    userId: req.user?.userId ?? null,
    role: req.user?.role ?? null,
    libraryId: req.user?.libraryId ?? null,
    userAgent:
      typeof req.get === "function" ? req.get("user-agent") || null : null,
    referer:
      typeof req.get === "function" ? req.get("referer") || null : null,
    requestId:
      (typeof req.get === "function" && req.get("x-request-id")) ||
      req.id ||
      null,
  };
}

function buildResponseMessage(req) {
  if (isProduction()) {
    return PUBLIC_NOT_IMPLEMENTED_MESSAGE;
  }
  const path = req.originalUrl || req.path || "this route";
  return `No controller implementation is available for ${path}`;
}

/**
 * Error payload for `sendError` third body field (`data`).
 * Production: code only. Non-production: adds debug metadata (same `code`).
 */
function buildResponseData(req) {
  const base = { code: NOT_IMPLEMENTED_CODE };
  if (isProduction()) {
    return base;
  }
  const meta = collectRequestMeta(req);
  return {
    ...base,
    debug: {
      method: meta.method,
      path: meta.path,
      timestamp: meta.timestamp,
      requestId: meta.requestId,
    },
  };
}

/**
 * Fallback for routes wired to the controller layer before handlers exist.
 * Logs server-side; returns 501 with stable client shape.
 */
async function notImplemented(req, res) {
  const meta = collectRequestMeta(req);
  logger.warn("Unimplemented route accessed", meta);

  const message = buildResponseMessage(req);
  const data = buildResponseData(req);

  return sendError(res, message, 501, data);
}

module.exports = {
  notImplemented,
};
