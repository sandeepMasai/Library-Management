const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");
const { requireNotExpiredSubscription } = require("../middleware/subscription.middleware");
const seatController = require("../controllers/seat.controller");

const router = express.Router();

router.get("/", requireAuth, requireRole("admin", "library"), requireNotExpiredSubscription, seatController.listSeats);
router.post("/", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.createSeat);
router.post("/bulk-create", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.bulkCreateSeats);
router.patch("/:id", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.updateSeatSpace);
router.post("/:id/assign", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.assignSeat);
router.post("/assign", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.assignSeat);
router.post("/:id/unassign", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.unassignSeat);
router.post("/unassign", requireAuth, requireRole("library"), requireNotExpiredSubscription, seatController.unassignSeat);

module.exports = router;
