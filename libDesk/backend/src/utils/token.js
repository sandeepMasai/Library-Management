const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { createHttpError } = require("./httpError");

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "7d";
const REFRESH_TOKEN_TTL_MS_RAW = Number(process.env.REFRESH_TOKEN_TTL_MS);
const REFRESH_TOKEN_TTL_MS = Number.isFinite(REFRESH_TOKEN_TTL_MS_RAW)
  ? REFRESH_TOKEN_TTL_MS_RAW
  : 7 * 24 * 60 * 60 * 1000;

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

const WEAK_SECRET_EXACT = new Set(
  [
    "secret",
    "test",
    "password",
    "admin",
    "jwt",
    "jwt_secret",
    "changeme",
    "change_me",
    "12345678",
    "0123456789",
  ].map((s) => s.toLowerCase())
);

let accessSecretValidated = false;
let refreshSecretValidated = false;

function getMinSecretLength() {
  const raw = Number.parseInt(process.env.AUTH_JWT_MIN_SECRET_LENGTH || "32", 10);
  return Number.isFinite(raw) && raw >= 16 ? Math.min(raw, 256) : 32;
}

function assertSecretStrength(secret, label) {
  const s = String(secret || "");
  if (!s) return;
  const lower = s.trim().toLowerCase();
  if (WEAK_SECRET_EXACT.has(lower)) {
    const msg = `${label} is too weak (default/insecure value)`;
    if (IS_PRODUCTION) throw createHttpError(500, msg);
    // eslint-disable-next-line no-console
    console.warn(`[token] ${msg}`);
  }
  if (s.length < getMinSecretLength()) {
    const msg = `${label} must be at least ${getMinSecretLength()} characters`;
    if (IS_PRODUCTION) throw createHttpError(500, msg);
    // eslint-disable-next-line no-console
    console.warn(`[token] ${msg} (non-production: allowed)`);
  }
}

function getAccessTokenSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw createHttpError(500, "Access token secret is not configured");
  }
  if (!accessSecretValidated) {
    assertSecretStrength(secret, "AUTH_JWT_SECRET / JWT_SECRET");
    accessSecretValidated = true;
  }
  return secret;
}

function getRefreshTokenSecret() {
  const explicit =
    process.env.AUTH_REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET;
  if (!explicit && IS_PRODUCTION) {
    throw createHttpError(500, "Refresh token secret is not configured");
  }
  const secret =
    explicit && String(explicit).trim()
      ? String(explicit).trim()
      : `${getAccessTokenSecret()}:refresh`;
  if (!refreshSecretValidated) {
    assertSecretStrength(secret, "AUTH_REFRESH_TOKEN_SECRET / composite refresh secret");
    refreshSecretValidated = true;
  }
  return secret;
}

function getAllowedAlgorithms() {
  const raw = process.env.AUTH_JWT_ALGORITHMS || "HS256";
  return String(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getPrimaryAlgorithm() {
  const algs = getAllowedAlgorithms();
  return algs[0] || "HS256";
}

function getIssuerForVerify(kind) {
  if (kind === "refresh") {
    const r = process.env.AUTH_REFRESH_JWT_ISSUER?.trim();
    if (r) return r;
  }
  return process.env.AUTH_JWT_ISSUER?.trim() || undefined;
}

function getAudienceForVerify(kind) {
  if (kind === "refresh") {
    const a = process.env.AUTH_REFRESH_JWT_AUDIENCE?.trim();
    if (a) return a;
  }
  return process.env.AUTH_JWT_AUDIENCE?.trim() || undefined;
}

/**
 * Centralized verify options for jsonwebtoken (access + refresh).
 * @param {"access"|"refresh"} kind
 */
function getJwtVerifyOptions(kind = "access") {
  const opts = {
    algorithms: getAllowedAlgorithms(),
    clockTolerance:
      Number.parseInt(process.env.AUTH_JWT_CLOCK_TOLERANCE_SEC || "5", 10) ||
      5,
  };
  const issuer = getIssuerForVerify(kind);
  if (issuer) opts.issuer = issuer;
  const audience = getAudienceForVerify(kind);
  if (audience) opts.audience = audience;
  return opts;
}

function getIssuerForSign(kind) {
  return getIssuerForVerify(kind);
}

function getAudienceForSign(kind) {
  return getAudienceForVerify(kind);
}

/**
 * Centralized sign options (algorithm, expiry, issuer, audience).
 * @param {"access"|"refresh"} kind
 */
function getJwtSignOptions(kind = "access") {
  const base = {
    algorithm: getPrimaryAlgorithm(),
    expiresIn: kind === "access" ? ACCESS_TOKEN_TTL : REFRESH_TOKEN_TTL,
  };
  const issuer = getIssuerForSign(kind);
  if (issuer) base.issuer = issuer;
  const audience = getAudienceForSign(kind);
  if (audience) base.audience = audience;
  return base;
}

function normalizeTokenPayload(payload) {
  return {
    userId: String(payload.userId || "").trim(),
    role: String(payload.role || "").trim(),
    libraryId: payload.libraryId || null,
  };
}

function isRefreshLikePayload(p) {
  return p?.type === "refresh" || p?.tokenType === "refresh";
}

function isAccessLikePayload(p) {
  return (
    p?.tokenType === "access" ||
    p?.token_use === "access" ||
    p?.typ === "access"
  );
}

function requireAccessTypEnabled() {
  const v = String(process.env.AUTH_JWT_REQUIRE_ACCESS_TYP || "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Post-verify payload checks (confusion / shape). Call after jwt.verify.
 * @param {"access"|"refresh"} expectedKind
 */
function validateTokenPayload(decoded, expectedKind) {
  if (!decoded || typeof decoded !== "object") {
    const err = createHttpError(401, "Invalid auth token");
    throw err;
  }

  const userId = String(decoded.userId || "").trim();
  const role = String(decoded.role || "").trim();

  if (!userId || userId.length > 128) {
    const err = createHttpError(401, "Invalid auth token payload");
    throw err;
  }
  if (!role || role.length > 64) {
    const err = createHttpError(401, "Invalid auth token payload");
    throw err;
  }

  if (expectedKind === "access") {
    if (isRefreshLikePayload(decoded)) {
      const err = createHttpError(401, "Invalid auth token");
      err.data = { code: "WRONG_TOKEN_TYPE" };
      throw err;
    }
    if (requireAccessTypEnabled() && !isAccessLikePayload(decoded)) {
      const err = createHttpError(401, "Invalid auth token");
      err.data = { code: "ACCESS_TOKEN_REQUIRED" };
      throw err;
    }
  }

  if (expectedKind === "refresh") {
    if (!isRefreshLikePayload(decoded)) {
      const err = createHttpError(401, "Invalid refresh token");
      throw err;
    }
    if (!decoded.tokenId || String(decoded.tokenId).trim().length < 8) {
      const err = createHttpError(401, "Invalid refresh token");
      throw err;
    }
  }

  return decoded;
}

function assertSignablePayload(payload) {
  const base = normalizeTokenPayload(payload);
  if (!base.userId || base.userId.length > 128) {
    throw createHttpError(500, "Invalid token subject for signing");
  }
  if (!base.role || base.role.length > 64) {
    throw createHttpError(500, "Invalid token role for signing");
  }
  return base;
}

function signAccessToken(payload) {
  const base = assertSignablePayload(payload);
  const body = {
    ...base,
    tokenType: "access",
    token_use: "access",
  };
  return jwt.sign(body, getAccessTokenSecret(), getJwtSignOptions("access"));
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(
    token,
    getAccessTokenSecret(),
    getJwtVerifyOptions("access")
  );
  validateTokenPayload(decoded, "access");
  return decoded;
}

function signRefreshToken(payload) {
  const base = assertSignablePayload(payload);
  const tokenId = crypto.randomUUID();
  const body = {
    ...base,
    tokenId,
    tokenType: "refresh",
    type: "refresh",
  };
  const token = jwt.sign(
    body,
    getRefreshTokenSecret(),
    getJwtSignOptions("refresh")
  );
  let expiresAt;
  try {
    const decoded = jwt.decode(token, { complete: false });
    if (decoded?.exp && Number.isFinite(decoded.exp)) {
      expiresAt = new Date(decoded.exp * 1000);
    }
  } catch {
    expiresAt = null;
  }
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  }
  return { token, tokenId, expiresAt };
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(
    token,
    getRefreshTokenSecret(),
    getJwtVerifyOptions("refresh")
  );
  validateTokenPayload(decoded, "refresh");
  return decoded;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  getAccessTokenSecret,
  getJwtSignOptions,
  getJwtVerifyOptions,
  getRefreshTokenSecret,
  hashToken,
  signAccessToken,
  signRefreshToken,
  validateTokenPayload,
  verifyAccessToken,
  verifyRefreshToken,
};
