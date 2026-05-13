const { requireAuth } = require("./auth.middleware");
const { createHttpError } = require("../utils/httpError");

function requireAdminAuth(req, res, next) {
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== "admin") {
      return next(createHttpError(403, "Admin access required"));
    }
    return next();
  });
}

module.exports = {
  requireAdminAuth,
};

