function login(_req, res) {
  // Route logic is currently handled in legacy route module.
  res.status(501).json({ message: "Use /api/auth via auth.routes.js" });
}

module.exports = {
  login,
};
