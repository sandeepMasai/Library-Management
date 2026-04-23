const express = require("express");
const attendanceRoutes = require("../../routes/attendance");

const router = express.Router();

// Reuse attendance token endpoints under /api/qr
router.use("/", attendanceRoutes);

module.exports = router;
