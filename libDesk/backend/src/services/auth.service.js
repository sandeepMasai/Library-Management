const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const Student = require("../models/Student");
const Library = require("../models/Library");
const Subscription = require("../models/Subscription");
const { logAction } = require("../utils/audit");
const { writeLog } = require("../utils/logging");
const {
  ensureLibraryNotExpired,
  resolveLibrarySubscriptionPeriod,
} = require("../utils/subscription");
const { createHttpError } = require("../utils/httpError");
const { verifyBcryptPassword, hashPassword } = require("../utils/authCredentials");
const { recordLibraryIdentity, recordStudentIdentity } = require("./authIdentity.service");
const { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/token");
const logger = require("../utils/logger");

const LOGIN_ATTEMPTS = new Map();

function attemptKey(metadata, identifier) {
  const ip = String(metadata?.ip || "unknown");
  return `${ip}:${String(identifier || "").toLowerCase()}`;
}

function checkAttempt(metadata, identifier) {
  const key = attemptKey(metadata, identifier);
  const state = LOGIN_ATTEMPTS.get(key);
  const now = Date.now();
  if (state?.blockedUntil && state.blockedUntil > now) {
    return { ok: false, retryAfterMs: state.blockedUntil - now };
  }
  return { ok: true, key };
}

function recordFail(key) {
  const now = Date.now();
  const state = LOGIN_ATTEMPTS.get(key) || { count: 0, blockedUntil: 0 };
  state.count += 1;
  if (state.count >= 5) {
    state.blockedUntil = now + 10 * 60 * 1000;
    state.count = 0;
  }
  LOGIN_ATTEMPTS.set(key, state);
}

function recordSuccess(key) {
  LOGIN_ATTEMPTS.delete(key);
}

function adminUser() {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setFullYear(expiry.getFullYear() + 10);

  return {
    id: "admin-1",
    role: "admin",
    name: "Admin",
    username: process.env.ADMIN_USERNAME || "admin",
    mobile: process.env.ADMIN_MOBILE || "0000000000",
    pin: process.env.ADMIN_PIN || "admin@123",
    joinDate: now.toISOString(),
    expiryDate: expiry.toISOString(),
    feeStatus: "Paid",
    feeAmount: 0,
    isBlocked: false,
  };
}

function studentResponse(student) {
  return {
    id: student._id.toString(),
    role: "student",
    libraryId: student.libraryId?.toString?.() || null,
    name: student.name,
    mobile: student.mobile,
    username: student.username,
    pin: "",
    joinDate: student.joinDate.toISOString(),
    expiryDate: student.expiryDate.toISOString(),
    feeAmount: student.feeAmount,
    feeStatus: student.feeStatus,
    isBlocked: student.isBlocked,
    photoUrl: student.photoUrl || null,
  };
}

function libraryResponse(library, latestSub = null) {
  const period = resolveLibrarySubscriptionPeriod(library, latestSub);
  return {
    id: library._id.toString(),
    role: "library",
    name: library.name,
    ownerName: library.ownerName,
    email: library.email,
    city: library.city,
    phone: library.phone || null,
    address: library.address || null,
    logoUrl: library.logoUrl || null,
    plan: library.plan,
    currentPlanKey: library.currentPlanKey || (library.plan === "pro" ? "monthly" : "none"),
    trialUsed: Boolean(library.trialUsed),
    subscriptionStatus: library.subscriptionStatus || "inactive",
    cancelledAt: library.cancelledAt?.toISOString?.() || null,
    cancelReason: library.cancelReason || null,
    cancelNote: library.cancelNote || null,
    planStartDate: period.startDate,
    planExpiryDate: period.expiryDate,
    libraryCode: library.libraryCode,
    isActive: library.isActive,
  };
}

async function issueAuthTokens(user, libraryId, metadata = {}, options = {}) {
  const payload = { userId: user.id, role: user.role, libraryId };
  const accessToken = signAccessToken(payload);
  const refresh = signRefreshToken(payload);
  const refreshTokenHash = hashToken(refresh.token);

  const familyId = options.familyId || crypto.randomUUID();

  await RefreshToken.create({
    tokenHash: refreshTokenHash,
    tokenId: refresh.tokenId,
    familyId,
    userId: String(user.id),
    identityUserId: options.identityUserId || null,
    role: user.role,
    libraryId: libraryId || null,
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

async function safeRecordIdentity(fn) {
  try {
    return await fn();
  } catch (error) {
    logger.warn("Auth identity sync skipped", { message: error?.message });
    return null;
  }
}

async function login({ body, metadata }) {
  const identifier = String(body?.usernameOrMobile || body?.email || "").trim().toLowerCase();
  const pin = String(body?.pin || "").trim();
  const password = String(body?.password || "").trim();
  const roleHint = String(body?.role || "").trim().toLowerCase();

  if (!identifier || (!pin && !password)) {
    throw createHttpError(400, "usernameOrMobile/email and pin/password are required");
  }

  const attempt = checkAttempt(metadata, identifier);
  if (!attempt.ok) throw createHttpError(429, "Too many attempts. Try again later.");

  // Admin login is intentionally separated: use POST /api/admin/login
  if (roleHint === "admin") {
    recordFail(attempt.key);
    throw createHttpError(403, "Admin login is not available here. Use /api/admin/login.");
  }

  if (identifier.includes("@") && password) {
    const library = await Library.findOne({ email: identifier }).select("+passwordHash");
    if (!library) {
      recordFail(attempt.key);
      throw createHttpError(401, "Invalid credentials");
    }
    if (!library.isActive) {
      recordFail(attempt.key);
      throw createHttpError(403, "Library is inactive");
    }
    await ensureLibraryNotExpired(library);
    const ok = await verifyBcryptPassword(password, library.passwordHash);
    if (!ok) {
      recordFail(attempt.key);
      throw createHttpError(401, "Invalid credentials");
    }
    const latestSub = await Subscription.findOne({ libraryId: library._id }).sort({ createdAt: -1 }).lean();
    const user = libraryResponse(library, latestSub);
    const identity = await safeRecordIdentity(() => recordLibraryIdentity(library));
    const tokens = await issueAuthTokens(user, user.id, metadata, {
      identityUserId: identity?._id,
    });
    writeLog({ action: "login", userId: user.id, role: "library", libraryId: user.id });
    await logAction({ action: "login", userId: user.id, role: "library", libraryId: user.id, ip: metadata?.ip, userAgent: metadata?.userAgent });
    recordSuccess(attempt.key);
    return { user, ...tokens };
  }

  const student = await Student.findOne({
    isDeleted: false,
    mobile: identifier,
  }).select("+pinHash");

  if (!student) {
    recordFail(attempt.key);
    throw createHttpError(401, "Invalid credentials");
  }
  if (student.isBlocked) {
    recordFail(attempt.key);
    throw createHttpError(403, "Account is blocked");
  }
  const pinOk = await student.verifyPin(pin);
  if (!pinOk) {
    recordFail(attempt.key);
    throw createHttpError(401, "Invalid credentials");
  }

  const user = studentResponse(student);
  const libraryId = student.libraryId.toString();
  const identity = await safeRecordIdentity(() => recordStudentIdentity(student));
  const tokens = await issueAuthTokens(user, libraryId, metadata, {
    identityUserId: identity?._id,
  });
  writeLog({ action: "login", userId: user.id, role: "student", libraryId: student.libraryId });
  await logAction({ action: "login", userId: user.id, role: "student", libraryId: student.libraryId, ip: metadata?.ip, userAgent: metadata?.userAgent });
  recordSuccess(attempt.key);
  return { user, ...tokens };
}

async function registerLibrary({ body, metadata }) {
  const libraryName = String(body?.libraryName || "").trim();
  const ownerName = String(body?.ownerName || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const city = String(body?.city || "").trim();

  if (!libraryName || !ownerName || !email || !password || !city) {
    throw createHttpError(400, "libraryName, ownerName, email, password, city are required");
  }

  const passwordHash = await hashPassword(password, 10);

  const library = await Library.create({
    name: libraryName,
    ownerName,
    email,
    passwordHash,
    city,
    plan: "none",
    currentPlanKey: "none",
    subscriptionStatus: "inactive",
    trialUsed: false,
    planStartDate: null,
    planExpiryDate: null,
    isActive: true,
  });

  const user = libraryResponse(library);
  const identity = await safeRecordIdentity(() => recordLibraryIdentity(library));
  const tokens = await issueAuthTokens(user, user.id, metadata, {
    identityUserId: identity?._id,
  });
  await logAction({
    action: "register_library",
    userId: user.id,
    role: "library",
    libraryId: user.id,
    ip: metadata?.ip,
    userAgent: metadata?.userAgent,
  });
  return { user, ...tokens, libraryCode: user.libraryCode };
}

async function refresh({ body, metadata }) {
  const refreshToken = String(body?.refreshToken || "").trim();
  if (!refreshToken) throw createHttpError(400, "refreshToken is required");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    if (error?.name === "TokenExpiredError") throw createHttpError(401, "Refresh token expired");
    throw createHttpError(401, "Invalid refresh token");
  }

  const isRefreshToken =
    payload?.type === "refresh" || payload?.tokenType === "refresh";
  if (!isRefreshToken || !payload?.tokenId || !payload?.userId || !payload?.role) {
    throw createHttpError(401, "Invalid refresh token");
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash, tokenId: payload.tokenId });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    throw createHttpError(401, "Invalid refresh token");
  }

  const tokenUser = {
    id: String(stored.userId),
    role: stored.role,
  };
  const libraryId = stored.libraryId?.toString?.() || null;
  const tokens = await issueAuthTokens(tokenUser, libraryId, metadata, {
    familyId: stored.familyId || crypto.randomUUID(),
    identityUserId: stored.identityUserId || undefined,
  });

  stored.revokedAt = new Date();
  stored.replacedByTokenHash = hashToken(tokens.refreshToken);
  await stored.save();

  await logAction({
    action: "refresh_token",
    userId: stored.userId,
    role: stored.role,
    libraryId: stored.libraryId || null,
    ip: metadata?.ip,
    userAgent: metadata?.userAgent,
  });

  return tokens;
}

module.exports = {
  login,
  refresh,
  registerLibrary,
};
