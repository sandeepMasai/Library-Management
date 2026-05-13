const express = require("express");
const attendanceRoutes = require("./attendance.routes");

const router = express.Router();

// Reuse attendance token endpoints under /api/qr
router.use("/", attendanceRoutes);

module.exports = router;
