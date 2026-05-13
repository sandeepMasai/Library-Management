const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");
const shiftController = require("../controllers/shift.controller");

const router = express.Router();

router.get("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, shiftController.listShifts);
router.post("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, shiftController.createShift);
router.patch("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, shiftController.updateShift);
router.delete("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, shiftController.deleteShift);

module.exports = router;
