const { sendError } = require("../utils/response");

function notImplemented(_req, res) {
  // Route logic is currently handled in legacy route module.
  return sendError(res, "Use /api/attendance via attendance.routes.js", 501);
}

module.exports = {
  notImplemented,
};
