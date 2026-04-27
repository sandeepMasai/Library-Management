function notImplemented(_req, res) {
  // QR APIs are served through attendance routes for this project.
  res.status(501).json({ message: "Use /api/attendance/token via qr.routes.js" });
}

module.exports = {
  notImplemented,
};
