const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const adminAuthService = require("../services/adminAuth.service");

function getRequestMeta(req) {
  return {
    ip: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"),
    userAgent: String(req.headers["user-agent"] || ""),
  };
}

function sanitizeAdminLoginBody(body = {}) {
  const username = String(body.username || "").trim();
  const pin = String(body.pin || body.password || "").trim();
  if (!username || !pin) throw createHttpError(400, "username and pin are required");
  return { username, pin };
}

const login = asyncHandler(async (req, res) => {
  const result = await adminAuthService.loginAdmin({
    body: sanitizeAdminLoginBody(req.body),
    metadata: getRequestMeta(req),
  });
  return sendSuccess(res, result, "Admin login successful");
});

module.exports = {
  login,
};

