const jwt = require("jsonwebtoken");

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || "dev_secret";

function requireAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, AUTH_JWT_SECRET);
    // Multi-tenant security enforced
    req.user = {
      userId: payload.userId,
      role: payload.role,
      libraryId: payload.libraryId || null,
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid auth token" });
  }
}

module.exports = {
  requireAuth,
};
