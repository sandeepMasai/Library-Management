const logger = require("../utils/logger");
const { sendError } = require("../utils/response");

async function notImplemented(req, res) {
  const isProduction =
    process.env.NODE_ENV === "production";

  const route =
    req.originalUrl || req.path || "unknown";

  logger.warn("unimplemented_qr_route", {
    method: req.method,
    route,
    ip: req.ip,
    userId: req.user?.userId || null,
  });

  return sendError(
    res,
    isProduction
      ? "Feature not implemented"
      : `No controller implementation for ${route}`,
    501,
    {
      code: "NOT_IMPLEMENTED",
      hint: "Use /api/attendance/token",
      timestamp: new Date().toISOString(),
    }
  );
}

module.exports = {
  notImplemented,
};