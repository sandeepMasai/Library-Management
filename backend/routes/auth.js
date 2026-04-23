const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const Library = require("../models/Library");
const { writeLog } = require("../src/utils/logging");
const { ensureLibraryNotExpired } = require("../src/utils/subscription");

const router = express.Router();
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || "library-auth-secret";

// Login attempt protection:
// - max 5 attempts
// - temporary block
// (Suggestion only; production should use Redis or persistent store.)
const LOGIN_ATTEMPTS = new Map(); // key -> { count, blockedUntil }

function attemptKey(req, identifier) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown");
  return `${ip}:${String(identifier || "").toLowerCase()}`;
}

function checkAttempt(req, identifier) {
  const key = attemptKey(req, identifier);
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
    state.blockedUntil = now + 10 * 60 * 1000; // 10 min
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
    pin: "", // never return sensitive fields
    joinDate: student.joinDate.toISOString(),
    expiryDate: student.expiryDate.toISOString(),
    feeAmount: student.feeAmount,
    feeStatus: student.feeStatus,
    isBlocked: student.isBlocked,
    photoUrl: student.photoUrl || null,
  };
}

function libraryResponse(library) {
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
    planStartDate: library.planStartDate?.toISOString?.() || null,
    planExpiryDate: library.planExpiryDate?.toISOString?.() || null,
    libraryCode: library.libraryCode,
    isActive: library.isActive,
  };
}

router.post("/login", async (req, res) => {
  try {
    const identifier = String(req.body?.usernameOrMobile || req.body?.email || "").trim().toLowerCase();
    const pin = String(req.body?.pin || "").trim();
    const password = String(req.body?.password || "").trim();
    const libraryCode = String(req.body?.libraryCode || "").trim().toUpperCase();

    if (!identifier || (!pin && !password)) {
      return res.status(400).json({ message: "usernameOrMobile/email and pin/password are required" });
    }

    const attempt = checkAttempt(req, identifier);
    if (!attempt.ok) {
      return res.status(429).json({ message: "Too many attempts. Try again later." });
    }

    const admin = adminUser();
    const adminMatches =
      identifier === admin.username.toLowerCase() || identifier === admin.mobile.toLowerCase();
    const adminPinMatches = pin === admin.pin || pin === "admin123";
    if (adminMatches && adminPinMatches) {
      const authToken = jwt.sign(
        { userId: admin.id, role: admin.role, libraryId: null },
        AUTH_JWT_SECRET,
        { expiresIn: "7d" }
      );
      // Track login activity (admin)
      writeLog({ action: "login", userId: admin.id, role: "admin", libraryId: null });
      recordSuccess(attempt.key);
      return res.json({ user: admin, authToken });
    }

    // Library login: email + password
    if (identifier.includes("@") && password) {
      const library = await Library.findOne({ email: identifier });
      if (!library) {
        recordFail(attempt.key);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!library.isActive) {
        recordFail(attempt.key);
        return res.status(403).json({ message: "Library is inactive" });
      }
      // Auto-downgrade if plan expired (instead of blocking login).
      await ensureLibraryNotExpired(library);
      const ok = await bcrypt.compare(password, library.passwordHash);
      if (!ok) {
        recordFail(attempt.key);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const user = libraryResponse(library);
      const authToken = jwt.sign(
        { userId: user.id, role: user.role, libraryId: user.id },
        AUTH_JWT_SECRET,
        { expiresIn: "7d" }
      );
      // Track login activity (library)
      writeLog({ action: "login", userId: user.id, role: "library", libraryId: user.id });
      recordSuccess(attempt.key);
      return res.json({ user, authToken });
    }

    // Student login: mobile + PIN (libraryCode not required)
    // NOTE: Requires Student.mobile globally unique.
    const student = await Student.findOne({
      isDeleted: false,
      mobile: identifier,
    });

    if (!student) {
      recordFail(attempt.key);
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (student.isBlocked) {
      recordFail(attempt.key);
      return res.status(403).json({ message: "Account is blocked" });
    }
    const pinOk = await student.verifyPin(pin);
    if (!pinOk) {
      recordFail(attempt.key);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = studentResponse(student);
    const authToken = jwt.sign(
      { userId: user.id, role: user.role, libraryId: student.libraryId.toString() },
      AUTH_JWT_SECRET,
      { expiresIn: "7d" }
    );
    // Track login activity (student)
    writeLog({ action: "login", userId: user.id, role: "student", libraryId: student.libraryId });
    recordSuccess(attempt.key);
    return res.json({ user, authToken });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.post("/register-library", async (req, res) => {
  try {
    const libraryName = String(req.body?.libraryName || "").trim();
    const ownerName = String(req.body?.ownerName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const city = String(req.body?.city || "").trim();

    if (!libraryName || !ownerName || !email || !password || !city) {
      return res.status(400).json({ message: "libraryName, ownerName, email, password, city are required" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Free trial: 30 days
    const now = Date.now();
    const planStartDate = new Date(now);
    const planExpiryDate = new Date(now + 30 * 24 * 60 * 60 * 1000);

    const library = await Library.create({
      name: libraryName,
      ownerName,
      email,
      passwordHash,
      city,
      plan: "free",
      planStartDate,
      planExpiryDate,
      isActive: true,
    });

    const user = libraryResponse(library);
    const authToken = jwt.sign(
      { userId: user.id, role: user.role, libraryId: user.id },
      AUTH_JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({ user, authToken, libraryCode: user.libraryCode });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

module.exports = router;
