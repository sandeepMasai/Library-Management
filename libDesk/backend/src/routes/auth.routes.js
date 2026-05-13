const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      data: null,
      message: "Too many login attempts. Try again later.",
    }),
});

router.post("/login", loginLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/register-library", authController.registerLibrary);

module.exports = router;
