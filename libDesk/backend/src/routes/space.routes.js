const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");
const spaceController = require("../controllers/space.controller");

const router = express.Router();

router.get("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, spaceController.listSpaces);
router.post("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, spaceController.createSpace);
router.patch("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, spaceController.updateSpace);
router.delete("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, spaceController.deleteSpace);

module.exports = router;
