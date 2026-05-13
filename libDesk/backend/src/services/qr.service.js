const AttendanceQr = require("../models/AttendanceQr");

async function getActiveQr(now = new Date()) {
  return AttendanceQr.findOne({ expiresAt: { $gt: now } }).sort({ expiresAt: -1 });
}

module.exports = {
  getActiveQr,
};
