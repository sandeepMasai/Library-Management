function notImplemented(_req, res) {
  // Route logic is currently handled in legacy route module.
  res.status(501).json({ message: "Use /api/students via student.routes.js" });
}

module.exports = {
  notImplemented,
};
