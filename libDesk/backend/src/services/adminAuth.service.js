const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const { logAction } = require("../utils/audit");
const { writeLog } = require("../utils/logging");
const { createHttpError } = require("../utils/httpError");
const { hashToken, signAccessToken, signRefreshToken } = require("../utils/token");

function adminIdentity() {
  return {
    id: "admin-1",
    role: "admin",
    name: "Admin",
    username: process.env.ADMIN_USERNAME || "admin",
    pin: process.env.ADMIN_PIN || "admin@123",
  };
}

async function issueAdminTokens(admin, metadata = {}) {
  const payload = { userId: admin.id, role: "admin", libraryId: null };
  const accessToken = signAccessToken(payload);
  const refresh = signRefreshToken(payload);
  const refreshTokenHash = hashToken(refresh.token);

  await RefreshToken.create({
    tokenHash: refreshTokenHash,
    tokenId: refresh.tokenId,
    familyId: crypto.randomUUID(),
    userId: String(admin.id),
    identityUserId: null,
    role: "admin",
    libraryId: null,
    expiresAt: refresh.expiresAt,
    ip: metadata.ip || null,
    userAgent: metadata.userAgent || null,
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    authToken: accessToken,
  };
}

async function loginAdmin({ body, metadata }) {
  const username = String(body?.username || "").trim().toLowerCase();
  const pin = String(body?.pin || "").trim();
  if (!username || !pin) {
    throw createHttpError(400, "username and pin are required");
  }

  const admin = adminIdentity();
  const ok =
    username === String(admin.username).trim().toLowerCase() &&
    pin === String(admin.pin).trim();
  if (!ok) {
    writeLog({ action: "admin_login_failed", userId: "admin-1", role: "admin", libraryId: null });
    await logAction({
      action: "admin_login_failed",
      userId: "admin-1",
      role: "admin",
      libraryId: null,
      ip: metadata?.ip,
      userAgent: metadata?.userAgent,
      metadata: { username },
    });
    throw createHttpError(401, "Invalid admin credentials");
  }

  const user = {
    id: admin.id,
    role: "admin",
    name: admin.name,
    username: admin.username,
    mobile: "0000000000",
    joinDate: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    feeStatus: "Paid",
    feeAmount: 0,
    isBlocked: false,
  };
  const tokens = await issueAdminTokens(admin, metadata);
  writeLog({ action: "admin_login", userId: admin.id, role: "admin", libraryId: null });
  await logAction({ action: "admin_login", userId: admin.id, role: "admin", libraryId: null, ip: metadata?.ip, userAgent: metadata?.userAgent });
  return { user, ...tokens };
}

module.exports = {
  loginAdmin,
};

