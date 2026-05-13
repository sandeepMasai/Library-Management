const authService = require("../services/auth.service");
const asyncHandler = require("../utils/asyncHandler");
const { createHttpError } = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

const AUTH_ROLES = new Set(["admin", "library", "student"]);

function sanitizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return AUTH_ROLES.has(role) ? role : undefined;
}

function getRequestMeta(req) {
  return {
    ip: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"),
    userAgent: String(req.headers["user-agent"] || ""),
  };
}

function sanitizeLoginBody(body = {}) {
  const role = sanitizeRole(body.role || body.loginType || body.accountType);
  const usernameOrMobile = String(body.usernameOrMobile || body.email || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "").trim();
  const pin = String(body.pin || "").trim();
  const libraryCode = String(body.libraryCode || "").trim().toUpperCase();

  if (!usernameOrMobile && !email) {
    throw createHttpError(400, "usernameOrMobile/email and pin/password are required");
  }

  if (role === "library" && !password) {
    throw createHttpError(400, "password is required");
  }

  if (role === "student" && !pin) {
    throw createHttpError(400, "pin is required");
  }

  if (!pin && !password) {
    throw createHttpError(400, "usernameOrMobile/email and pin/password are required");
  }

  return {
    usernameOrMobile: usernameOrMobile || email,
    email,
    password,
    pin,
    ...(libraryCode ? { libraryCode } : {}),
    ...(role ? { role } : {}),
  };
}

function sanitizeRegisterLibraryBody(body = {}) {
  const libraryName = String(body.libraryName || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "").trim();
  const city = String(body.city || "").trim();

  if (!libraryName || !ownerName || !email || !password || !city) {
    throw createHttpError(400, "libraryName, ownerName, email, password, city are required");
  }

  return {
    libraryName,
    ownerName,
    email,
    password,
    city,
  };
}

function sanitizeRefreshBody(body = {}) {
  const refreshToken = String(body.refreshToken || "").trim();
  if (!refreshToken) throw createHttpError(400, "refreshToken is required");
  return { refreshToken };
}

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    body: sanitizeLoginBody(req.body),
    metadata: getRequestMeta(req),
  });
  return sendSuccess(res, result, "Login successful");
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh({
    body: sanitizeRefreshBody(req.body),
    metadata: getRequestMeta(req),
  });
  return sendSuccess(res, result, "Token refreshed successfully");
});

const registerLibrary = asyncHandler(async (req, res) => {
  const result = await authService.registerLibrary({
    body: sanitizeRegisterLibraryBody(req.body),
    metadata: getRequestMeta(req),
  });
  return sendSuccess(res, result, "Library registered successfully", 201);
});

module.exports = {
  login,
  refresh,
  registerLibrary,
};
