const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");
const allocationController = require("../controllers/allocation.controller");

const router = express.Router();

router.get("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, allocationController.listAllocations);
router.post("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, allocationController.createAllocation);
router.patch("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, allocationController.cancelAllocation);

module.exports = router;
