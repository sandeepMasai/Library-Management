const express = require("express");
const mongoose = require("mongoose");
const Seat = require("../models/Seat");
const { requireAuth } = require("../src/middleware/auth.middleware");
const { requireRole } = require("../src/middleware/role.middleware");

const router = express.Router();

function requireLibraryIdForAdmin(req, res) {
  if (req.user?.role === "admin") {
    const libraryId = String(req.query.libraryId || req.body?.libraryId || "").trim();
    if (!libraryId || !mongoose.Types.ObjectId.isValid(libraryId)) {
      res.status(400).json({ message: "libraryId is required for admin" });
      return null;
    }
    return libraryId;
  }
  return req.user?.libraryId;
}

function toResponse(seat) {
  return {
    id: seat._id.toString(),
    libraryId: seat.libraryId?.toString?.() || null,
    number: seat.number,
    spaceId: seat.spaceId ? seat.spaceId.toString() : null,
    status: seat.status,
    studentId: seat.studentId ? seat.studentId.toString() : null,
  };
}

router.get("/", requireAuth, requireRole("admin", "library"), async (req, res) => {
  try {
    // Multi-tenant security enforced
    const libraryId = requireLibraryIdForAdmin(req, res);
    if (!libraryId) return;
    const list = await Seat.find({ libraryId }).sort({ number: 1 }).lean();
    return res.json(list.map(toResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch seats", error: error.message });
  }
});

router.post("/", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const number = Number(req.body?.number);
    const spaceId = req.body?.spaceId ? String(req.body.spaceId).trim() : null;
    if (!Number.isInteger(number) || number < 1) {
      return res.status(400).json({ message: "number must be a positive integer" });
    }
    if (spaceId && !mongoose.Types.ObjectId.isValid(spaceId)) {
      return res.status(400).json({ message: "Invalid spaceId" });
    }
    // Multi-tenant security enforced
    const created = await Seat.create({ libraryId, number, spaceId: spaceId || null, status: "available", studentId: null });
    return res.status(201).json(toResponse(created));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Seat number already exists" });
    }
    return res.status(500).json({ message: "Failed to create seat", error: error.message });
  }
});

/**
 * POST /api/seats/bulk-create
 * Body: { totalSeats: number, spaceId?: string|null }
 *
 * Idempotent: creates missing seats from 1..N.
 */
router.post("/bulk-create", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const totalSeats = Number(req.body?.totalSeats);
    const spaceId = req.body?.spaceId ? String(req.body.spaceId).trim() : null;
    if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 5000) {
      return res.status(400).json({ message: "totalSeats must be an integer between 1 and 5000" });
    }
    if (spaceId && !mongoose.Types.ObjectId.isValid(spaceId)) {
      return res.status(400).json({ message: "Invalid spaceId" });
    }

    const existing = await Seat.find({ libraryId, number: { $gte: 1, $lte: totalSeats } }, { number: 1 }).lean();
    const existsSet = new Set(existing.map((s) => s.number));
    const docs = [];
    for (let n = 1; n <= totalSeats; n++) {
      if (!existsSet.has(n)) docs.push({ libraryId, number: n, spaceId: spaceId || null, status: "available", studentId: null });
    }
    if (docs.length) await Seat.insertMany(docs, { ordered: false });
    const list = await Seat.find({ libraryId }).sort({ number: 1 }).lean();
    return res.json(list.map(toResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to bulk create seats", error: error.message });
  }
});

/**
 * PATCH /api/seats/:id
 * Body: { spaceId: string|null }
 */
router.patch("/:id", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.params.id || "").trim();
    const spaceId = req.body?.spaceId === null || req.body?.spaceId === "" ? null : String(req.body?.spaceId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(seatId)) return res.status(400).json({ message: "Invalid seatId" });
    if (spaceId && !mongoose.Types.ObjectId.isValid(spaceId)) return res.status(400).json({ message: "Invalid spaceId" });

    const updated = await Seat.findOneAndUpdate({ _id: seatId, libraryId }, { spaceId: spaceId || null }, { new: true });
    if (!updated) return res.status(404).json({ message: "Seat not found" });
    return res.json(toResponse(updated));
  } catch (error) {
    return res.status(500).json({ message: "Failed to update seat", error: error.message });
  }
});

router.post("/:id/assign", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.params.id || "").trim();
    const studentId = String(req.body?.studentId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(seatId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: "Invalid seatId/studentId" });
    }

    // Multi-tenant security enforced
    const seat = await Seat.findOne({ _id: seatId, libraryId });
    if (!seat) return res.status(404).json({ message: "Seat not found" });

    seat.studentId = studentId;
    seat.status = "occupied";
    await seat.save();
    return res.json(toResponse(seat));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Seat or student already assigned" });
    }
    return res.status(500).json({ message: "Failed to assign seat", error: error.message });
  }
});

/**
 * POST /api/seats/assign
 *
 * Alias endpoint to support clients that send { seatId, studentId }.
 * (Keeps /api/seats/:id/assign as the canonical REST path.)
 */
router.post("/assign", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.body?.seatId || "").trim();
    const studentId = String(req.body?.studentId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(seatId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: "Invalid seatId/studentId" });
    }

    // Multi-tenant security enforced
    const seat = await Seat.findOne({ _id: seatId, libraryId });
    if (!seat) return res.status(404).json({ message: "Seat not found" });

    seat.studentId = studentId;
    seat.status = "occupied";
    await seat.save();
    return res.json(toResponse(seat));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Seat or student already assigned" });
    }
    return res.status(500).json({ message: "Failed to assign seat", error: error.message });
  }
});

router.post("/:id/unassign", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(seatId)) {
      return res.status(400).json({ message: "Invalid seatId" });
    }
    // Multi-tenant security enforced
    const seat = await Seat.findOne({ _id: seatId, libraryId });
    if (!seat) return res.status(404).json({ message: "Seat not found" });
    seat.studentId = null;
    seat.status = "available";
    await seat.save();
    return res.json(toResponse(seat));
  } catch (error) {
    return res.status(500).json({ message: "Failed to unassign seat", error: error.message });
  }
});

router.post("/unassign", requireAuth, requireRole("library"), async (req, res) => {
  try {
    const libraryId = req.user.libraryId;
    const seatId = String(req.body?.seatId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(seatId)) {
      return res.status(400).json({ message: "Invalid seatId" });
    }
    // Multi-tenant security enforced
    const seat = await Seat.findOne({ _id: seatId, libraryId });
    if (!seat) return res.status(404).json({ message: "Seat not found" });
    seat.studentId = null;
    seat.status = "available";
    await seat.save();
    return res.json(toResponse(seat));
  } catch (error) {
    return res.status(500).json({ message: "Failed to unassign seat", error: error.message });
  }
});

module.exports = router;

