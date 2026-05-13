const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const settingsController = require("../controllers/settings.controller");

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), settingsController.getSettings);
router.put("/", requireAuth, requireRole("admin"), settingsController.updateSettings);

module.exports = router;
