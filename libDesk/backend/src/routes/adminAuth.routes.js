const express = require("express");
const rateLimit = require("express-rate-limit");
const adminAuthController = require("../controllers/adminAuth.controller");

const router = express.Router();

const adminLoginLimiter = rateLimit({
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

router.post("/login", adminLoginLimiter, adminAuthController.login);

module.exports = router;

